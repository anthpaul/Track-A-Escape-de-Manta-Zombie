/**
 * Paso de escape cuando A* no encuentra un refugio alcanzable (AGENTS.md §4.3, regla 2).
 *
 * Quedarse quieto al lado de un zombie es la forma en que se perdió a la mayoría de
 * los sobrevivientes en las corridas locales de R2/R3: caminantes y corredores
 * simplemente llegan hasta el sobreviviente que espera. Por eso, cuando no hay
 * refugio alcanzable en este turno, el sobreviviente se mueve a la opción legal
 * (incluido quedarse) más lejana, en calles, de todos los zombies que se mueven.
 * Las hordas no se mueven; su zona bloqueada ya está en nodosProhibidos.
 *
 * Puro y barato: un único BFS multiorigen sobre el grafo, solo en el caso "sin_ruta".
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

  // Quedarse gana los empates: moverse solo vale la pena si gana distancia.
  let mejor = nodoActual;
  for (const vecino of indexado.vecinos(nodoActual)) {
    if (!indexado.esMovimientoValido(nodoActual, vecino, mundo.aristasBloqueadas)) continue;
    if (peligros.nodosProhibidos.has(vecino)) continue;
    if (costoPeligroArista(peligros, vecino, `${nodoActual}|${vecino}`) === Infinity) continue;
    if (lejania(vecino) > lejania(mejor)) mejor = vecino;
  }
  return mejor;
}

/** Calles desde cada nodo hasta el zombie móvil más cercano, recorriendo solo calles no bloqueadas. */
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
