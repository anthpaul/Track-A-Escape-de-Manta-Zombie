import type { Grafo, Zombie } from "@/features/mapa/domain/tipos";

// Pure graph rules shared by the map and the mock simulation.
// nodosBloqueadosPorHordas mirrors the router rule (AGENTS.md §4.4): replace it with the
// shared/ implementation once T0.2 lands, so map and router always use the same set.

export function vecinos(grafo: Grafo): Map<string, string[]> {
  const adyacencia = new Map<string, string[]>(grafo.nodos.map((n) => [n.id, []]));
  for (const c of grafo.calles) {
    adyacencia.get(c.desde)?.push(c.hasta);
    adyacencia.get(c.hasta)?.push(c.desde);
  }
  return adyacencia;
}

export function nodosBloqueadosPorHordas(grafo: Grafo, zombies: Zombie[]): Set<string> {
  const adyacencia = vecinos(grafo);
  const bloqueados = new Set<string>();
  for (const z of zombies) {
    if (z.tipo !== "horda") continue;
    bloqueados.add(z.nodo);
    for (const v of adyacencia.get(z.nodo) ?? []) bloqueados.add(v);
  }
  return bloqueados;
}
