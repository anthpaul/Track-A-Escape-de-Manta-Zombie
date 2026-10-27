import type { Grafo, Snapshot, Zombie } from "@/features/mapa/domain/tipos";

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

type MundoAcceso = Pick<Snapshot, "zombies" | "aristasBloqueadas"> & {
  sobrevivientes: Pick<Snapshot["sobrevivientes"][number], "nodo" | "estado">[];
};

// Shelters nobody can reach this turn, with the same rules the router uses: horde zones are forbidden
// and blocked streets do not exist. A shelter inside a horde zone is always cut off; otherwise it is cut
// off when survivors are on the road and none of them has a free path to it (e.g. a horde on the only
// way in). With nobody on the road there is no one to cut off, so only the first rule applies.
export function refugiosSinAcceso(grafo: Grafo, mundo: MundoAcceso): Set<string> {
  const prohibidos = nodosBloqueadosPorHordas(grafo, mundo.zombies);
  const bloqueadas = new Set(mundo.aristasBloqueadas);
  const adyacencia = new Map<string, string[]>(grafo.nodos.map((n) => [n.id, []]));
  for (const c of grafo.calles) {
    if (bloqueadas.has(c.id)) continue;
    adyacencia.get(c.desde)?.push(c.hasta);
    adyacencia.get(c.hasta)?.push(c.desde);
  }
  const enRuta = new Set(mundo.sobrevivientes.filter((s) => s.estado === "en_ruta").map((s) => s.nodo));

  const sinAcceso = new Set<string>();
  for (const r of grafo.refugios) {
    if (prohibidos.has(r.nodo)) {
      sinAcceso.add(r.id);
      continue;
    }
    if (enRuta.size === 0 || enRuta.has(r.nodo)) continue;
    // Search back from the shelter. A survivor standing inside a horde zone still counts as reached:
    // the router lets them step out, it only forbids stepping in.
    const vistos = new Set([r.nodo]);
    const cola = [r.nodo];
    let alcanzado = false;
    while (cola.length > 0 && !alcanzado) {
      for (const v of adyacencia.get(cola.shift()!) ?? []) {
        if (vistos.has(v)) continue;
        vistos.add(v);
        if (enRuta.has(v)) {
          alcanzado = true;
          break;
        }
        if (!prohibidos.has(v)) cola.push(v);
      }
    }
    if (!alcanzado) sinAcceso.add(r.id);
  }
  return sinAcceso;
}
