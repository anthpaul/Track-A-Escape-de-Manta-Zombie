import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Grafo, Nodo, TipoCalle } from "@/features/mapa/domain/tipos";

// Pure graph → GeoJSON converters. MapLibre layers only consume their output,
// so the map always draws exactly the graph the router uses.

export type CalleProps = { id: string; tipo: TipoCalle; bloqueada: boolean };
export type RefugioProps = { id: string; nombre: string; capacidad: number };
// Traffic-sign points on blocked streets: a no-entry disc (street) or a danger triangle (bridge) in
// the middle, and a stop bar at each end of a blocked street. rumbo is the street bearing there.
export type SenalProps = { calle: string; tipo: "prohibido" | "peligro" | "tope"; rumbo: number };

const indexarNodos = (nodos: Nodo[]) => new Map(nodos.map((n) => [n.id, n]));

type Coord = [number, number];

const coordenadasCalle = (geometria: Coord[], desde: Nodo, hasta: Nodo): Coord[] =>
  geometria.length >= 2 ? geometria : [[desde.lng, desde.lat], [hasta.lng, hasta.lat]];

// Local flat approximation: plenty for a few hundred meters of street.
const dx = (a: Coord, b: Coord) => (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
const dy = (a: Coord, b: Coord) => b[1] - a[1];
const largo = (a: Coord, b: Coord) => Math.hypot(dx(a, b), dy(a, b));
// Degrees clockwise from north, as MapLibre's icon-rotate expects with map alignment.
const rumbo = (a: Coord, b: Coord) => (Math.atan2(dx(a, b), dy(a, b)) * 180) / Math.PI;

// Point halfway along the line (by length) and the bearing of the segment it falls on.
function puntoMedio(coords: Coord[]): { punto: Coord; rumbo: number } {
  const total = coords.slice(1).reduce((t, c, i) => t + largo(coords[i], c), 0);
  let resto = total / 2;
  for (let i = 1; i < coords.length; i++) {
    const tramo = largo(coords[i - 1], coords[i]);
    if (tramo > 0 && resto <= tramo) {
      const f = resto / tramo;
      const [a, b] = [coords[i - 1], coords[i]];
      return { punto: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], rumbo: rumbo(a, b) };
    }
    resto -= tramo;
  }
  return { punto: coords[0], rumbo: 0 };
}

export function callesAGeoJSON(
  grafo: Grafo,
  bloqueadas: ReadonlySet<string> = new Set(),
): FeatureCollection<LineString, CalleProps> {
  const nodos = indexarNodos(grafo.nodos);
  const features: Feature<LineString, CalleProps>[] = [];

  for (const calle of grafo.calles) {
    const desde = nodos.get(calle.desde);
    const hasta = nodos.get(calle.hasta);
    // A street pointing to an unknown node is a data bug; skipping it keeps the rest of the map alive.
    if (!desde || !hasta) continue;

    const coordinates = coordenadasCalle(calle.geometria, desde, hasta);

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { id: calle.id, tipo: calle.tipo, bloqueada: bloqueadas.has(calle.id) },
    });
  }

  return { type: "FeatureCollection", features };
}

export function refugiosAGeoJSON(grafo: Grafo): FeatureCollection<Point, RefugioProps> {
  const nodos = indexarNodos(grafo.nodos);
  const features: Feature<Point, RefugioProps>[] = [];

  for (const refugio of grafo.refugios) {
    const nodo = nodos.get(refugio.nodo);
    if (!nodo) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [nodo.lng, nodo.lat] },
      properties: { id: refugio.id, nombre: refugio.nombre, capacidad: refugio.capacidad },
    });
  }

  return { type: "FeatureCollection", features };
}

export function senalesAGeoJSON(grafo: Grafo, bloqueadas: ReadonlySet<string>): FeatureCollection<Point, SenalProps> {
  const nodos = indexarNodos(grafo.nodos);
  const features: Feature<Point, SenalProps>[] = [];
  const senal = (punto: Coord, properties: SenalProps): Feature<Point, SenalProps> => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: punto },
    properties,
  });

  for (const calle of grafo.calles) {
    if (!bloqueadas.has(calle.id)) continue;
    const desde = nodos.get(calle.desde);
    const hasta = nodos.get(calle.hasta);
    if (!desde || !hasta) continue;
    const coords = coordenadasCalle(calle.geometria, desde, hasta);
    const medio = puntoMedio(coords);
    if (calle.tipo === "puente") {
      features.push(senal(medio.punto, { calle: calle.id, tipo: "peligro", rumbo: medio.rumbo }));
      continue;
    }
    const n = coords.length;
    features.push(
      senal(medio.punto, { calle: calle.id, tipo: "prohibido", rumbo: medio.rumbo }),
      senal(coords[0], { calle: calle.id, tipo: "tope", rumbo: rumbo(coords[0], coords[1]) }),
      senal(coords[n - 1], { calle: calle.id, tipo: "tope", rumbo: rumbo(coords[n - 2], coords[n - 1]) }),
    );
  }

  return { type: "FeatureCollection", features };
}
