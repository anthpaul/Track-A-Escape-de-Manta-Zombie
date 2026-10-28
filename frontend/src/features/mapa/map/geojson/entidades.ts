import type { Feature, FeatureCollection, Point } from "geojson";
import type { EstadoSobreviviente, Grafo, Nodo, Sobreviviente, TipoZombie, Vehiculo, Zombie } from "@/features/mapa/domain/tipos";
import { nodosBloqueadosPorHordas, refugiosSinAcceso } from "@/features/mapa/domain/grafo";

// Conversores puros de entidades en vivo a GeoJSON para las capas del mapa (zombies, sobrevivientes, zonas de horda).

export type ZombieProps = { id: string; tipo: Exclude<TipoZombie, "dormido"> };
export type SobrevivienteProps = { id: string; estado: EstadoSobreviviente };
export type ZonaHordaProps = { nodo: string; origen: "horda" | "vecino" };
export type RefugioSinAccesoProps = { id: string; nombre: string };
export type VehiculoProps = { id: string; nombre: string; pasajeros: number };

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
    // Los dormidos son invisibles por regla; nunca se revelan, aunque un snapshot traiga uno por error.
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
    // Si viaja en una camioneta de rescate, se dibuja la camioneta, no a la persona a pie.
    if (s.vehiculo) continue;
    const nodo = nodos.get(s.nodo);
    if (nodo) features.push(punto(nodo, { id: s.id, estado: s.estado }));
  }
  return { type: "FeatureCollection", features };
}

// Refugios que nadie puede alcanzar en este turno (ver refugiosSinAcceso), dibujados con un anillo y una etiqueta de peligro.
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

// Flota de rescate (Pro): un punto por camioneta con cuántas personas lleva ("Camioneta 1", nunca V-1).
export function vehiculosAGeoJSON(grafo: Grafo, vehiculos: readonly Vehiculo[] | undefined): FeatureCollection<Point, VehiculoProps> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const features: Feature<Point, VehiculoProps>[] = [];
  for (const v of vehiculos ?? []) {
    const nodo = nodos.get(v.nodo);
    const numero = /^V-(\d+)$/.exec(v.id)?.[1];
    if (nodo) features.push(punto(nodo, { id: v.id, nombre: numero ? `Camioneta ${numero}` : v.id, pasajeros: v.pasajeros.length }));
  }
  return { type: "FeatureCollection", features };
}
