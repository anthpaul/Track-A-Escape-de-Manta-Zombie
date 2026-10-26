import type { Feature, FeatureCollection, LineString, Point, Position } from "geojson";
import type { Grafo, Sobreviviente } from "./tipos";

// Pure helpers for the "planned route" requirement (AGENTS.md §2, plan A9):
// one followed survivor with its full route, plus a short arrow per survivor toward its next node.

export function elegirSeguido(sobrevivientes: Sobreviviente[], actualId: string | null): string | null {
  const enRuta = sobrevivientes.filter((s) => s.estado === "en_ruta");
  if (actualId && enRuta.some((s) => s.id === actualId)) return actualId;
  if (enRuta.length === 0) return null;
  return enRuta.map((s) => s.id).sort()[0];
}

export type FlechaProps = { clave: string; cantidad: number };
export type PuntaProps = FlechaProps & { rumbo: number };

// Arrow covers this fraction of the street so it does not hide the next node.
const LARGO_FLECHA = 0.6;

// Compass bearing in degrees (0 = north, 90 = east), good enough at city scale.
function rumbo(desde: Position, hasta: Position): number {
  const dx = (hasta[0] - desde[0]) * Math.cos((desde[1] * Math.PI) / 180);
  const dy = hasta[1] - desde[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function flechasAGeoJSON(
  grafo: Grafo,
  sobrevivientes: Sobreviviente[],
): { lineas: FeatureCollection<LineString, FlechaProps>; puntas: FeatureCollection<Point, PuntaProps> } {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  // 200 survivors share few streets: one arrow per direction, with how many people take it.
  const conteo = new Map<string, number>();
  for (const s of sobrevivientes) {
    if (s.estado !== "en_ruta" || !s.siguienteNodo || s.siguienteNodo === s.nodo) continue;
    if (!nodos.has(s.nodo) || !nodos.has(s.siguienteNodo)) continue;
    const clave = `${s.nodo}>${s.siguienteNodo}`;
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }

  const lineas: Feature<LineString, FlechaProps>[] = [];
  const puntas: Feature<Point, PuntaProps>[] = [];
  for (const [clave, cantidad] of conteo) {
    const [a, b] = clave.split(">").map((id) => nodos.get(id)!);
    const inicio: Position = [a.lng, a.lat];
    const fin: Position = [a.lng + (b.lng - a.lng) * LARGO_FLECHA, a.lat + (b.lat - a.lat) * LARGO_FLECHA];
    lineas.push({ type: "Feature", geometry: { type: "LineString", coordinates: [inicio, fin] }, properties: { clave, cantidad } });
    puntas.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: fin },
      properties: { clave, cantidad, rumbo: rumbo(inicio, fin) },
    });
  }
  return { lineas: { type: "FeatureCollection", features: lineas }, puntas: { type: "FeatureCollection", features: puntas } };
}

// Full route as one line, following each street's drawn geometry in walking direction.
export function rutaAGeoJSON(grafo: Grafo, ruta: string[]): FeatureCollection<LineString, { pasos: number }> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const coordenadas: Position[] = [];

  for (let i = 1; i < ruta.length; i++) {
    const a = nodos.get(ruta[i - 1]);
    const b = nodos.get(ruta[i]);
    // An unknown node breaks the route: stop there instead of drawing a straight jump across it.
    if (!a || !b) break;
    const calle = grafo.calles.find(
      (c) => (c.desde === a.id && c.hasta === b.id) || (c.desde === b.id && c.hasta === a.id),
    );
    let tramo: Position[] =
      calle && calle.geometria.length >= 2 ? calle.geometria : [[a.lng, a.lat], [b.lng, b.lat]];
    if (calle && calle.geometria.length >= 2 && calle.desde !== a.id) tramo = [...tramo].reverse();
    // Skip the first point of every segment after the first: it repeats the previous end.
    coordenadas.push(...(coordenadas.length === 0 ? tramo : tramo.slice(1)));
  }

  const features: Feature<LineString, { pasos: number }>[] =
    coordenadas.length >= 2
      ? [{ type: "Feature", geometry: { type: "LineString", coordinates: coordenadas }, properties: { pasos: ruta.length - 1 } }]
      : [];
  return { type: "FeatureCollection", features };
}
