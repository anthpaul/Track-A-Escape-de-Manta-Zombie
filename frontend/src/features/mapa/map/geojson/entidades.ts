import type { Feature, FeatureCollection, Point } from "geojson";
import type { EstadoSobreviviente, Grafo, Nodo, Sobreviviente, TipoZombie, Zombie } from "@/features/mapa/domain/tipos";
import { nodosBloqueadosPorHordas, refugiosSinAcceso } from "@/features/mapa/domain/grafo";

// Pure converters from live entities to GeoJSON for the map layers (zombies, survivors, horde zones).

export type ZombieProps = { id: string; tipo: Exclude<TipoZombie, "dormido"> };
export type SobrevivienteProps = { id: string; estado: EstadoSobreviviente };
export type ZonaHordaProps = { nodo: string; origen: "horda" | "vecino" };
export type RefugioSinAccesoProps = { id: string; nombre: string };

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

// Shelters nobody can reach this turn (see refugiosSinAcceso), drawn with a danger ring and label.
export function refugiosSinAccesoAGeoJSON(
  grafo: Grafo,
  mundo: Parameters<typeof refugiosSinAcceso>[1],
): FeatureCollection<Point, RefugioSinAccesoProps> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const cortados = refugiosSinAcceso(grafo, mundo);
  const features: Feature<Point, RefugioSinAccesoProps>[] = [];
  for (const r of grafo.refugios) {
    const nodo = nodos.get(r.nodo);
    if (nodo && cortados.has(r.id)) features.push(punto(nodo, { id: r.id, nombre: r.nombre }));
  }
  return { type: "FeatureCollection", features };
}
