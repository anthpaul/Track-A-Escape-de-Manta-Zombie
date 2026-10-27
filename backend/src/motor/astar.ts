/**
 * A* router — K1 implementation (AGENTS.md §4.4, HOJA_DE_RUTA §4.1 item 3).
 *
 * Finds the next node a survivor should move to in order to reach the nearest
 * reachable shelter with minimum turns, breaking ties by travel time.
 *
 * Danger awareness (this file, K1):
 *   - Blocked edges (city events)
 *   - Horde-blocked nodes (node + all static neighbors)
 *
 * NOT handled here (K2, next task):
 *   - Cost penalty for walker-adjacent nodes
 *   - Forbidden cross-traffic edges (cruce de frente)
 *   - Runner prediction (Pro, K5)
 *
 * Cost model (adjustment A3 — PLAN_IMPLEMENTACION §6):
 *   edge cost = 1 + ε × (distancia_m / velocidad_m_s)
 *
 * The leading "1" makes the search minimize TURNS (hops), not travel time.
 * The ε term is a tiebreaker: among equally-fast routes in turns, prefer the
 * one with less real travel time. ε must be small enough that it never
 * converts a 1-hop route into a costlier one than a 0-hop route.
 *   Max single-edge time contribution: longest street / slowest type
 *   Conservative upper bound: 2000 m / 1.0 m·s⁻¹ = 2000 s
 *   ε = 0.0001 → max ε×time = 0.2 << 1  ✓
 */

import type { Grafo, Refugio } from "@abcstack/shared";
import { VELOCIDADES_M_S, type GrafoIndexado } from "@abcstack/shared";
import { MinHeap } from "./min-heap";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tiebreaker weight for travel time inside the edge cost formula. */
const EPSILON = 0.0001;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ResultadoBusqueda =
  | { tipo: "movimiento"; siguienteNodo: string; refugio: string; costoTotal: number }
  | { tipo: "ya_en_refugio"; nodo: string; refugio: string }
  | { tipo: "sin_ruta"; nodo: string };

// ---------------------------------------------------------------------------
// Haversine distance helper (admissible heuristic input)
// ---------------------------------------------------------------------------

/** Returns the straight-line distance in metres between two lat/lng points. */
function distanciaHaversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
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
// Index builder — called once per Lambda warm start, not per request
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
 * Uses straight-line distance / max possible speed, so it never overestimates.
 * Returns 0 when the node IS a shelter node (already there).
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
  let minTurnos = Infinity;

  for (const refugio of refugiosAlcanzables) {
    const destCoord = contexto.coordenadas.get(refugio.nodo);
    if (!destCoord) continue;
    const distancia = distanciaHaversine(coord.lat, coord.lng, destCoord.lat, destCoord.lng);
    // Convert metres to turns: one turn = one edge traversal.
    // Minimum edge time ≈ 1 turn, so floor at 0 when already on the shelter node.
    const turnos = nodoId === refugio.nodo ? 0 : Math.max(0, distancia / maxVelocidad * EPSILON);
    // The heuristic is the turn count (integer lower bound) + ε tie-break:
    // a direct neighbour is 1 turn away at minimum.
    const h = nodoId === refugio.nodo ? 0 : 1 * (distancia / maxVelocidad * EPSILON);
    minTurnos = Math.min(minTurnos, h);
  }
  return minTurnos === Infinity ? 0 : minTurnos;
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
 */
export function buscarRuta(
  nodoActual: string,
  contexto: ContextoGrafo,
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
): ResultadoBusqueda {
  const { indexado } = contexto;

  // Pre-compute danger sets for this turn (K1 scope: horde-blocked nodes).
  const bloqueadosPorHordas = indexado.nodosBloqueadosPorHordas(mundo.zombies);
  const aristasBloqueadas = new Set(mundo.aristasBloqueadas);

  // Shelters reachable in principle (node exists and is not blocked by a horde).
  // A horde on a shelter node is an edge case — we still try the other shelters.
  const refugiosDisponibles = contexto.refugios.filter(
    (r) => !bloqueadosPorHordas.has(r.nodo),
  );

  // Already at a shelter?
  const refugioActual = contexto.refugios.find((r) => r.nodo === nodoActual);
  if (refugioActual) {
    return { tipo: "ya_en_refugio", nodo: nodoActual, refugio: refugioActual.id };
  }

  if (refugiosDisponibles.length === 0) {
    return { tipo: "sin_ruta", nodo: nodoActual };
  }

  // A* with one simultaneous search toward all shelters.
  // State: (nodo, refugioDestino). We run a single open set across all
  // targets and stop as soon as any shelter is popped.
  const INFINITY = Infinity;
  // best g-cost seen for (nodoId, refugioId)
  const gCost = new Map<string, number>();
  const stateKey = (nodo: string, refugio: string) => `${nodo}|${refugio}`;

  const heap = new MinHeap<NodoAstar>();

  // Seed the heap: one entry per reachable shelter from the current node.
  // The "first step" from the start node is the start node itself — it gets
  // overwritten on the first expansion.
  for (const refugio of refugiosDisponibles) {
    const h = heuristica(nodoActual, contexto, [refugio]);
    const key = stateKey(nodoActual, refugio.id);
    gCost.set(key, 0);
    heap.push(0 + h, {
      id: nodoActual,
      g: 0,
      primerPaso: nodoActual, // placeholder; replaced on first real move
      refugioDestino: refugio.id,
    });
  }

  while (!heap.isEmpty()) {
    const { value: current } = heap.pop()!;
    const key = stateKey(current.id, current.refugioDestino);
    const bestG = gCost.get(key) ?? INFINITY;

    // Skip stale entries (lazy deletion).
    if (current.g > bestG) continue;

    // Goal check: reached the target shelter.
    const refugioMeta = contexto.refugios.find((r) => r.id === current.refugioDestino);
    if (refugioMeta && current.id === refugioMeta.nodo) {
      // The first step is the node we should move to this turn.
      const siguienteNodo = current.primerPaso === nodoActual
        ? current.id   // only if we're already there (zero-step, caught above)
        : current.primerPaso;
      return {
        tipo: "movimiento",
        siguienteNodo,
        refugio: current.refugioDestino,
        costoTotal: current.g,
      };
    }

    // Expand neighbors.
    for (const vecino of indexado.vecinos(current.id)) {
      // Skip nodes blocked by hordes.
      if (bloqueadosPorHordas.has(vecino)) continue;

      // Skip edges that are blocked by city events.
      if (!indexado.esMovimientoValido(current.id, vecino, aristasBloqueadas)) continue;

      const calle = indexado.calleEntre(current.id, vecino);
      if (!calle) continue; // defensive; esMovimientoValido already ensures this

      const velocidad = VELOCIDADES_M_S[calle.tipo];
      const edgeCost = 1 + EPSILON * (calle.distancia_m / velocidad);
      const tentativeG = current.g + edgeCost;

      const vecinoKey = stateKey(vecino, current.refugioDestino);
      if (tentativeG >= (gCost.get(vecinoKey) ?? INFINITY)) continue;

      gCost.set(vecinoKey, tentativeG);

      // Track the first step: if we are expanding directly from the origin,
      // the first step IS the neighbor we are moving to.
      const primerPaso = current.id === nodoActual ? vecino : current.primerPaso;

      const h = heuristica(vecino, contexto, [
        contexto.refugios.find((r) => r.id === current.refugioDestino)!,
      ]);
      heap.push(tentativeG + h, {
        id: vecino,
        g: tentativeG,
        primerPaso,
        refugioDestino: current.refugioDestino,
      });
    }
  }

  // No path found to any shelter — safe fallback: stay put.
  return { tipo: "sin_ruta", nodo: nodoActual };
}
