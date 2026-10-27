/**
 * A* router — K1 + K2 implementation (AGENTS.md §4.4, HOJA_DE_RUTA §4.1 items 3–4).
 *
 * Finds the next node a survivor should move to in order to reach the nearest
 * reachable shelter with minimum turns, breaking ties by travel time.
 *
 * Danger awareness (full K1+K2 scope):
 *   - Blocked edges (city events)                       K1
 *   - Horde-blocked nodes (node + all static neighbors) K1 via peligros.ts
 *   - Any node with a visible zombie                    K2 via peligros.ts
 *   - Walker-adjacent nodes (high-cost penalty)         K2 via peligros.ts
 *   - Cross-traffic edges (cruce de frente)             K2 via peligros.ts
 *
 * NOT handled here (future tasks):
 *   - Runner prediction (Pro, K5)
 *
 * Cost model (adjustment A3 — PLAN_IMPLEMENTACION §6):
 *   edge cost = 1 + ε × (distancia_m / velocidad_m_s) + danger_penalty
 *
 * The leading "1" makes the search minimize TURNS (hops), not travel time.
 * ε = 0.0001; max ε×time ≈ 0.2 << 1 turn — safe tiebreaker.
 */

import type { Grafo, Refugio } from "@abcstack/shared";
import { VELOCIDADES_M_S, type GrafoIndexado } from "@abcstack/shared";
import { MinHeap } from "./min-heap";
import type { MundoTurno } from "./fuente-mundo";
import { calcularPeligros, costoPeligroArista, type Peligros } from "./peligros";

// Re-export so callers only need to import from astar.ts
export type { Peligros };
export { calcularPeligros };

/** Tiebreaker weight for travel time inside the edge cost formula. */
const EPSILON = 0.0001;

export type ResultadoBusqueda =
  | { tipo: "movimiento"; siguienteNodo: string; refugio: string; costoTotal: number }
  | { tipo: "ya_en_refugio"; nodo: string; refugio: string }
  | { tipo: "sin_ruta"; nodo: string };

// ---------------------------------------------------------------------------
// Haversine distance helper (admissible heuristic input)
// ---------------------------------------------------------------------------

function distanciaHaversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Routing context — built once per Lambda warm start
// ---------------------------------------------------------------------------

export interface ContextoGrafo {
  /** Indexed graph for neighbor/edge lookups. */
  indexado: GrafoIndexado;
  /** Node coordinates for the heuristic. */
  coordenadas: ReadonlyMap<string, { lat: number; lng: number }>;
  /** All four shelters with their node IDs. */
  refugios: readonly Readonly<Refugio>[];
}

/** Build a routing context from the static graph. Freeze and cache the result. */
export function crearContextoGrafo(grafo: Grafo, indexado: GrafoIndexado): ContextoGrafo {
  const coordenadas = new Map(grafo.nodos.map((n) => [n.id, { lat: n.lat, lng: n.lng }]));
  return Object.freeze({
    indexado,
    coordenadas,
    refugios: Object.freeze(grafo.refugios.map((r) => Object.freeze({ ...r }))),
  });
}

// ---------------------------------------------------------------------------
// Admissible heuristic
// ---------------------------------------------------------------------------

/**
 * Lower-bound cost (in turns) from `nodo` to the nearest shelter.
 * Uses straight-line distance / max possible speed — never overestimates.
 */
function heuristica(
  nodoId: string,
  contexto: ContextoGrafo,
  refugiosAlcanzables: readonly Refugio[],
): number {
  if (refugiosAlcanzables.length === 0) return 0;
  const coord = contexto.coordenadas.get(nodoId);
  if (!coord) return 0;
  const maxVelocidad = Math.max(...Object.values(VELOCIDADES_M_S));
  let minH = Infinity;
  for (const refugio of refugiosAlcanzables) {
    if (nodoId === refugio.nodo) return 0;
    const destCoord = contexto.coordenadas.get(refugio.nodo);
    if (!destCoord) continue;
    const distancia = distanciaHaversine(coord.lat, coord.lng, destCoord.lat, destCoord.lng);
    minH = Math.min(minH, distancia / maxVelocidad * EPSILON);
  }
  return minH === Infinity ? 0 : minH;
}

// ---------------------------------------------------------------------------
// Core A* search
// ---------------------------------------------------------------------------

interface NodoAstar {
  id: string;
  /** g = cost from start to this node. */
  g: number;
  /** First step taken from the origin (to reconstruct the next move). */
  primerPaso: string;
  /** Which shelter we are heading towards. */
  refugioDestino: string;
}

/**
 * Run A* from `nodoActual` towards every reachable shelter and return
 * whichever route reaches a shelter with minimum cost.
 *
 * Returns the NEXT NODE to move to (one step), not the full path.
 * Returns the current node if no move is valid (safe fallback).
 *
 * Accepts optional pre-computed peligros for shared use across survivors
 * in the same turn (avoids redundant computation).
 */
export function buscarRuta(
  nodoActual: string,
  contexto: ContextoGrafo,
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
  peligrosPrecomputados?: Peligros,
): ResultadoBusqueda {
  const { indexado } = contexto;
  const peligros = peligrosPrecomputados ?? calcularPeligros(mundo, indexado);
  const aristasBloqueadas = new Set(mundo.aristasBloqueadas);

  const refugiosDisponibles = contexto.refugios.filter(
    (r) => !peligros.nodosProhibidos.has(r.nodo),
  );

  // Already at a shelter?
  const refugioActual = contexto.refugios.find((r) => r.nodo === nodoActual);
  if (refugioActual) {
    return { tipo: "ya_en_refugio", nodo: nodoActual, refugio: refugioActual.id };
  }

  if (refugiosDisponibles.length === 0) {
    return { tipo: "sin_ruta", nodo: nodoActual };
  }

  const INFINITY = Infinity;
  const gCost = new Map<string, number>();
  const stateKey = (nodo: string, refugio: string) => `${nodo}|${refugio}`;
  const heap = new MinHeap<NodoAstar>();

  for (const refugio of refugiosDisponibles) {
    const h = heuristica(nodoActual, contexto, [refugio]);
    gCost.set(stateKey(nodoActual, refugio.id), 0);
    heap.push(0 + h, { id: nodoActual, g: 0, primerPaso: nodoActual, refugioDestino: refugio.id });
  }

  while (!heap.isEmpty()) {
    const { value: current } = heap.pop()!;
    const key = stateKey(current.id, current.refugioDestino);

    // Skip stale entries (lazy deletion).
    if (current.g > (gCost.get(key) ?? INFINITY)) continue;

    // Goal check: reached the target shelter.
    const refugioMeta = contexto.refugios.find((r) => r.id === current.refugioDestino);
    if (refugioMeta && current.id === refugioMeta.nodo) {
      const siguienteNodo = current.primerPaso === nodoActual ? current.id : current.primerPaso;
      return { tipo: "movimiento", siguienteNodo, refugio: current.refugioDestino, costoTotal: current.g };
    }

    // Expand neighbors.
    for (const vecino of indexado.vecinos(current.id)) {
      // Skip edges blocked by city events first (edge doesn't exist).
      if (!indexado.esMovimientoValido(current.id, vecino, aristasBloqueadas)) continue;

      const calle = indexado.calleEntre(current.id, vecino);
      if (!calle) continue;

      // K2: apply danger cost. Infinity = forbidden, positive = penalty.
      const edgeKey = `${current.id}|${vecino}`;
      const peligroCosto = costoPeligroArista(peligros, vecino, edgeKey);
      if (peligroCosto === Infinity) continue;

      const velocidad = VELOCIDADES_M_S[calle.tipo];
      const edgeCost = 1 + EPSILON * (calle.distancia_m / velocidad) + peligroCosto;
      const tentativeG = current.g + edgeCost;

      const vecinoKey = stateKey(vecino, current.refugioDestino);
      if (tentativeG >= (gCost.get(vecinoKey) ?? INFINITY)) continue;

      gCost.set(vecinoKey, tentativeG);
      const primerPaso = current.id === nodoActual ? vecino : current.primerPaso;
      const h = heuristica(vecino, contexto, [
        contexto.refugios.find((r) => r.id === current.refugioDestino)!,
      ]);
      heap.push(tentativeG + h, { id: vecino, g: tentativeG, primerPaso, refugioDestino: current.refugioDestino });
    }
  }

  return { tipo: "sin_ruta", nodo: nodoActual };
}
