import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Grafo, Nodo, TipoCalle } from "@/features/mapa/domain/tipos";

// Pure graph → GeoJSON converters. MapLibre layers only consume their output,
// so the map always draws exactly the graph the router uses.

export type CalleProps = { id: string; tipo: TipoCalle; bloqueada: boolean };
export type RefugioProps = { id: string; nombre: string; capacidad: number };

const indexarNodos = (nodos: Nodo[]) => new Map(nodos.map((n) => [n.id, n]));

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

    const coordinates =
      calle.geometria.length >= 2
        ? calle.geometria
        : [[desde.lng, desde.lat], [hasta.lng, hasta.lat]];

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
