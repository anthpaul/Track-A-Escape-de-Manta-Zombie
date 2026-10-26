import type { Feature, FeatureCollection, Point } from "geojson";
import type { EstadoSobreviviente, Grafo, Nodo, Sobreviviente, TipoZombie, Zombie } from "./tipos";

// Pure converters for the live layers (zombies, survivors, horde zones).
// nodosBloqueadosPorHordas mirrors the router rule (AGENTS.md §4.4): replace it with the
// shared/ implementation once T0.2 lands, so map and router always use the same set.

export type ZombieProps = { id: string; tipo: Exclude<TipoZombie, "dormido"> };
export type SobrevivienteProps = { id: string; estado: EstadoSobreviviente };
export type ZonaHordaProps = { nodo: string; origen: "horda" | "vecino" };

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

const punto = <P>(nodo: Nodo, properties: P): Feature<Point, P> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [nodo.lng, nodo.lat] },
  properties,
});

export function zonasHordaAGeoJSON(grafo: Grafo, zombies: Zombie[]): FeatureCollection<Point, ZonaHordaProps> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const hordas = new Set(zombies.filter((z) => z.tipo === "horda").map((z) => z.nodo));
  const features: Feature<Point, ZonaHordaProps>[] = [];
  for (const id of nodosBloqueadosPorHordas(grafo, zombies)) {
    const nodo = nodos.get(id);
    if (nodo) features.push(punto(nodo, { nodo: id, origen: hordas.has(id) ? "horda" : "vecino" }));
  }
  return { type: "FeatureCollection", features };
}

export function zombiesAGeoJSON(grafo: Grafo, zombies: Zombie[]): FeatureCollection<Point, ZombieProps> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const features: Feature<Point, ZombieProps>[] = [];
  for (const z of zombies) {
    // Sleepers are invisible by rule; never reveal them even if a snapshot carries one by mistake.
    if (z.tipo === "dormido") continue;
    const nodo = nodos.get(z.nodo);
    if (nodo) features.push(punto(nodo, { id: z.id, tipo: z.tipo }));
  }
  return { type: "FeatureCollection", features };
}

export function sobrevivientesAGeoJSON(
  grafo: Grafo,
  sobrevivientes: Sobreviviente[],
): FeatureCollection<Point, SobrevivienteProps> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const features: Feature<Point, SobrevivienteProps>[] = [];
  for (const s of sobrevivientes) {
    const nodo = nodos.get(s.nodo);
    if (nodo) features.push(punto(nodo, { id: s.id, estado: s.estado }));
  }
  return { type: "FeatureCollection", features };
}
