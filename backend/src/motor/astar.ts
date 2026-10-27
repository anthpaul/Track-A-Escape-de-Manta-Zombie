/**
 * A* router — K1 + K2 implementation (AGENTS.md §4.4, HOJA_DE_RUTA §4.1 items 3–4).
 *
 * Cost model (adjustment A3):
 *   edge cost = 1 + ε × (distancia_m / velocidad_m_s) + danger_penalty
 *
 * The "1" minimizes TURNS (hops). ε is a tiebreaker for travel time.
 * ε = 0.0001, max ε×time ≈ 0.2 << 1 turn ✓
 */

import type { Grafo, Refugio } from "@abcstack/shared";
import { VELOCIDADES_M_S, type GrafoIndexado } from "@abcstack/shared";
import { MinHeap } from "./min-heap";
import type { MundoTurno } from "./fuente-mundo";
import { calcularPeligros, costoPeligroArista, type Peligros } from "./peligros";

// Re-export so callers only need to import from astar.ts
export type { Peligros };
export { calcularPeligros };

const EPSILON = 0.0001;

export type ResultadoBusqueda =
  | { tipo: "movimiento"; siguienteNodo: string; refugio: string; costoTotal: number }
  | { tipo: "ya_en_refugio"; nodo: string; refugio: string }
  | { tipo: "sin_ruta"; nodo: string };

// ---------------------------------------------------------------------------
// Haversine distance helper
// ---------------------------------------------------------------------------

function distanciaHaversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
  indexado: GrafoIndexado;
  coordenadas: ReadonlyMap<string, { lat: number; lng: number }>;
  refugios: readonly Readonly<Refugio>[];
}

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
  g: number;
  primerPaso: string;
  refugioDestino: string;
}

/**
 * Run A* from `nodoActual` and return the next node to move to.
 * Accepts optional pre-computed peligros for shared use across survivors.
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
    heap.push(h, { id: nodoActual, g: 0, primerPaso: nodoActual, refugioDestino: refugio.id });
  }

  while (!heap.isEmpty()) {
    const { value: current } = heap.pop()!;
    const key = stateKey(current.id, current.refugioDestino);
    if (current.g > (gCost.get(key) ?? INFINITY)) continue;

    const refugioMeta = contexto.refugios.find((r) => r.id === current.refugioDestino);
    if (refugioMeta && current.id === refugioMeta.nodo) {
      const siguienteNodo = current.primerPaso === nodoActual ? current.id : current.primerPaso;
      return { tipo: "movimiento", siguienteNodo, refugio: current.refugioDestino, costoTotal: current.g };
    }

    for (const vecino of indexado.vecinos(current.id)) {
      if (!indexado.esMovimientoValido(current.id, vecino, aristasBloqueadas)) continue;

      const calle = indexado.calleEntre(current.id, vecino);
      if (!calle) continue;

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
