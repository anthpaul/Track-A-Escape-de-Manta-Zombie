import type { Grafo, Nodo } from "./tipos";

// Turns contract codes (S-0005, N-0165) into words a visitor understands. The ids stay in the
// data and in accessible labels; only what is read on screen changes.

const BARRIOS: Record<NonNullable<Nodo["barrio"]>, string> = {
  tarqui: "Tarqui",
  los_esteros: "Los Esteros",
  barbasquillo: "Barbasquillo",
  jocay: "Jocay",
};

export function nombreSobreviviente(id: string): string {
  const numero = /^S-(\d+)$/.exec(id)?.[1];
  return numero ? `Sobreviviente ${Number(numero)}` : id;
}

export function refugioMasCercano(grafo: Grafo, nodo: Nodo | undefined) {
  if (!nodo) return undefined;
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  let mejor: { id: string; nombre: string; d: number } | undefined;
  for (const r of grafo.refugios) {
    const n = nodos.get(r.nodo);
    if (!n) continue;
    const d = (n.lat - nodo.lat) ** 2 + (n.lng - nodo.lng) ** 2;
    if (!mejor || d < mejor.d) mejor = { id: r.id, nombre: r.nombre, d };
  }
  return mejor;
}

// "en Los Esteros" inside the four start neighbourhoods of the challenge, otherwise near a shelter.
export function lugarDeNodo(grafo: Grafo, nodoId: string): string {
  const nodo = grafo.nodos.find((n) => n.id === nodoId);
  if (!nodo) return "en un punto desconocido";
  if (nodo.barrio) return `en ${BARRIOS[nodo.barrio]}`;
  const refugio = refugioMasCercano(grafo, nodo);
  return refugio ? `cerca de ${refugio.nombre}` : "en un punto desconocido";
}
