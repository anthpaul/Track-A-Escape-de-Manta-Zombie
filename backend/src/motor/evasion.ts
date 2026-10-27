/**
 * Escape step when A* finds no reachable shelter (AGENTS.md §4.3 rule 2).
 *
 * Staying put next to a zombie is how most survivors were lost in local R2/R3
 * runs: walkers and runners simply walk onto a survivor that waits. So when no
 * shelter is reachable this turn, the survivor moves to the legal option
 * (staying included) that is farthest, in streets, from every moving zombie.
 * Hordes do not move; their blocked zone is already in nodosProhibidos.
 *
 * Pure and cheap: one multi-source BFS over the graph, only on "sin_ruta".
 */

import type { ContextoGrafo } from "./astar";
import type { MundoTurno } from "./fuente-mundo";
import { costoPeligroArista, type Peligros } from "./peligros";

export function elegirEscape(
  nodoActual: string,
  contexto: ContextoGrafo,
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
  peligros: Peligros,
): string {
  const { indexado } = contexto;
  const distancia = distanciaAZombies(contexto, mundo);
  const lejania = (nodo: string) => distancia.get(nodo) ?? Infinity;

  // Staying wins ties: a move is only worth it when it gains distance.
  let mejor = nodoActual;
  for (const vecino of indexado.vecinos(nodoActual)) {
    if (!indexado.esMovimientoValido(nodoActual, vecino, mundo.aristasBloqueadas)) continue;
    if (peligros.nodosProhibidos.has(vecino)) continue;
    if (costoPeligroArista(peligros, vecino, `${nodoActual}|${vecino}`) === Infinity) continue;
    if (lejania(vecino) > lejania(mejor)) mejor = vecino;
  }
  return mejor;
}

/** Streets from each node to the nearest moving zombie, walking only unblocked streets. */
function distanciaAZombies(
  contexto: ContextoGrafo,
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
): Map<string, number> {
  const { indexado } = contexto;
  const distancia = new Map<string, number>();
  const cola: string[] = [];
  for (const zombie of mundo.zombies) {
    if (zombie.tipo === "horda" || distancia.has(zombie.nodo)) continue;
    distancia.set(zombie.nodo, 0);
    cola.push(zombie.nodo);
  }
  for (let i = 0; i < cola.length; i++) {
    const nodo = cola[i]!;
    for (const vecino of indexado.vecinos(nodo)) {
      if (distancia.has(vecino) || !indexado.esMovimientoValido(nodo, vecino, mundo.aristasBloqueadas)) continue;
      distancia.set(vecino, distancia.get(nodo)! + 1);
      cola.push(vecino);
    }
  }
  return distancia;
}
