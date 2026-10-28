import type { Grafo, Snapshot, Zombie } from "@/features/mapa/domain/tipos";

// Reglas puras del grafo que comparten el mapa y la simulación de prueba.
// nodosBloqueadosPorHordas replica la regla del motor de rutas (AGENTS.md §4.4): reemplazarla por la
// implementación de shared/ cuando se integre T0.2, para que mapa y motor usen siempre el mismo conjunto.

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

// Refugios que nadie puede alcanzar en este turno, con las mismas reglas del motor: las zonas de horda están prohibidas
// y las calles bloqueadas no existen. Un refugio dentro de una zona de horda siempre queda aislado; si no, queda
// aislado cuando hay sobrevivientes en camino y ninguno tiene un camino libre hasta él (p. ej., una horda en el único
// acceso). Sin nadie en camino no hay a quién aislar, así que solo aplica la primera regla.
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
    // Búsqueda hacia atrás desde el refugio. Un sobreviviente dentro de una zona de horda igual cuenta como alcanzado:
    // el motor le permite salir; solo prohíbe entrar.
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
