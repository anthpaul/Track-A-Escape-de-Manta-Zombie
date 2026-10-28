/**
 * Ruteador A*: implementación de K1 + K2 (AGENTS.md §4.4, HOJA_DE_RUTA §4.1, ítems 3–4).
 *
 * Encuentra el siguiente nodo al que debe moverse un sobreviviente para llegar
 * al refugio alcanzable más cercano en la menor cantidad de turnos; los empates
 * se desempatan por tiempo de recorrido.
 *
 * Peligros considerados (alcance completo de K1+K2):
 *   - Aristas bloqueadas (eventos de ciudad)                 K1
 *   - Nodos bloqueados por hordas (nodo + vecinos estáticos) K1 vía peligros.ts
 *   - Cualquier nodo con un zombie visible                   K2 vía peligros.ts
 *   - Nodos vecinos de un caminante (penalización alta)      K2 vía peligros.ts
 *   - Aristas con cruce de frente                            K2 vía peligros.ts
 *
 * NO se maneja acá (tareas futuras):
 *   - Predicción de corredores (Pro, K5)
 *
 * Modelo de costo (ajuste A3, PLAN_IMPLEMENTACION §6):
 *   costo de arista = 1 + ε × (distancia_m / velocidad_m_s) + penalización_por_peligro
 *
 * El "1" inicial hace que la búsqueda minimice TURNOS (saltos), no tiempo de recorrido.
 * ε = 0.0001; el máximo de ε×tiempo ≈ 0.2 << 1 turno: es un desempate seguro.
 */

import type { Grafo, Refugio } from "@abcstack/shared";
import { VELOCIDADES_M_S, type GrafoIndexado } from "@abcstack/shared";
import { MinHeap } from "./min-heap";
import { calcularPeligros, costoPeligroArista, type MundoPeligros, type Peligros } from "./peligros";

// Se reexporta para que quien llame solo necesite importar desde astar.ts
export type { Peligros };
export { calcularPeligros };

/** Peso de desempate del tiempo de recorrido dentro de la fórmula de costo de arista. */
const EPSILON = 0.0001;

export type ResultadoBusqueda =
  | { tipo: "movimiento"; siguienteNodo: string; refugio: string; costoTotal: number }
  | { tipo: "ya_en_refugio"; nodo: string; refugio: string }
  | { tipo: "sin_ruta"; nodo: string };

// ---------------------------------------------------------------------------
// Distancia de Haversine (insumo de la heurística admisible)
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
// Contexto de ruteo: se construye una sola vez por instancia caliente de Lambda
// ---------------------------------------------------------------------------

export interface ContextoGrafo {
  /** Grafo indexado para buscar vecinos y aristas. */
  indexado: GrafoIndexado;
  /** Coordenadas de los nodos para la heurística. */
  coordenadas: ReadonlyMap<string, { lat: number; lng: number }>;
  /** Los cuatro refugios con los IDs de sus nodos. */
  refugios: readonly Readonly<Refugio>[];
}

/** Construye el contexto de ruteo a partir del grafo estático. El resultado se congela y se cachea. */
export function crearContextoGrafo(grafo: Grafo, indexado: GrafoIndexado): ContextoGrafo {
  const coordenadas = new Map(grafo.nodos.map((n) => [n.id, { lat: n.lat, lng: n.lng }]));
  return Object.freeze({
    indexado,
    coordenadas,
    refugios: Object.freeze(grafo.refugios.map((r) => Object.freeze({ ...r }))),
  });
}

// ---------------------------------------------------------------------------
// Heurística admisible
// ---------------------------------------------------------------------------

/**
 * Cota inferior del costo (en turnos) desde `nodo` hasta el refugio más cercano.
 * Usa distancia en línea recta / velocidad máxima posible: nunca sobreestima.
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
// Búsqueda A* principal
// ---------------------------------------------------------------------------

interface NodoAstar {
  id: string;
  /** g = costo desde el inicio hasta este nodo. */
  g: number;
  /** Primer paso dado desde el origen (para reconstruir el siguiente movimiento). */
  primerPaso: string;
  /** Refugio hacia el que se dirige. */
  refugioDestino: string;
}

/**
 * Ejecuta A* desde `nodoActual` hacia todos los refugios alcanzables y devuelve
 * la ruta que llega a un refugio con el menor costo.
 *
 * Devuelve el SIGUIENTE NODO al que moverse (un paso), no el camino completo.
 * Devuelve el nodo actual si ningún movimiento es válido (fallback seguro).
 *
 * Acepta, de forma opcional, peligros precalculados para compartirlos entre los
 * sobrevivientes del mismo turno (evita cálculos repetidos).
 */
export function buscarRuta(
  nodoActual: string,
  contexto: ContextoGrafo,
  mundo: MundoPeligros,
  peligrosPrecomputados?: Peligros,
  // Capacidad de refugios (Pro, cupos.ts): solo estos refugios cuentan como destino; undefined = todos.
  refugiosPermitidos?: ReadonlySet<string>,
): ResultadoBusqueda {
  const { indexado } = contexto;
  const peligros = peligrosPrecomputados ?? calcularPeligros(mundo, indexado);
  const aristasBloqueadas = new Set(mundo.aristasBloqueadas);

  const permitido = (r: Readonly<Refugio>) => !refugiosPermitidos || refugiosPermitidos.has(r.id);
  const refugiosDisponibles = contexto.refugios.filter(
    (r) => permitido(r) && !peligros.nodosProhibidos.has(r.nodo),
  );

  // ¿Ya está en un refugio? Esperar en la puerta de uno lleno no cuenta: se sigue buscando.
  const refugioActual = contexto.refugios.find((r) => r.nodo === nodoActual && permitido(r));
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

    // Se saltan las entradas obsoletas (borrado perezoso).
    if (current.g > (gCost.get(key) ?? INFINITY)) continue;

    // Condición de meta: se llegó al refugio destino.
    const refugioMeta = contexto.refugios.find((r) => r.id === current.refugioDestino);
    if (refugioMeta && current.id === refugioMeta.nodo) {
      const siguienteNodo = current.primerPaso === nodoActual ? current.id : current.primerPaso;
      return { tipo: "movimiento", siguienteNodo, refugio: current.refugioDestino, costoTotal: current.g };
    }

    // Expandir vecinos.
    for (const vecino of indexado.vecinos(current.id)) {
      // Primero se saltan las aristas bloqueadas por eventos de ciudad (la arista no existe).
      if (!indexado.esMovimientoValido(current.id, vecino, aristasBloqueadas)) continue;

      const calle = indexado.calleEntre(current.id, vecino);
      if (!calle) continue;

      // K2: se aplica el costo de peligro. Infinity = prohibido; positivo = penalización.
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
