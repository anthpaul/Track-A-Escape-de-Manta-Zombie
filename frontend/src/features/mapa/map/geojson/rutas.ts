import type { Feature, FeatureCollection, LineString, Point, Position } from "geojson";
import type { Grafo, Sobreviviente } from "@/features/mapa/domain/tipos";

// GeoJSON para el requisito de "ruta planificada" (AGENTS.md §2, plan A9): la ruta completa del
// sobreviviente seguido, más una flecha corta por dirección hacia el siguiente nodo de cada sobreviviente.

export type FlechaProps = { clave: string; cantidad: number };
export type PuntaProps = FlechaProps & { rumbo: number };

// La flecha cubre esta fracción de la calle para no tapar el siguiente nodo.
const LARGO_FLECHA = 0.6;

// Rumbo de brújula en grados (0 = norte, 90 = este), suficiente a escala de ciudad.
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
  // 200 sobrevivientes comparten pocas calles: una flecha por dirección, con cuántas personas la toman.
  const conteo = new Map<string, number>();
  for (const s of sobrevivientes) {
    // Quien viaja en camioneta va adonde vaya la camioneta: no tiene flecha propia.
    if (s.estado !== "en_ruta" || s.vehiculo || !s.siguienteNodo || s.siguienteNodo === s.nodo) continue;
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

// Ruta completa como una sola línea, siguiendo la geometría dibujada de cada calle en el sentido de la marcha.
export function rutaAGeoJSON(grafo: Grafo, ruta: string[]): FeatureCollection<LineString, { pasos: number }> {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const coordenadas: Position[] = [];

  for (let i = 1; i < ruta.length; i++) {
    const a = nodos.get(ruta[i - 1]);
    const b = nodos.get(ruta[i]);
    // Un nodo desconocido corta la ruta: se detiene ahí en lugar de dibujar un salto recto sobre él.
    if (!a || !b) break;
    const calle = grafo.calles.find(
      (c) => (c.desde === a.id && c.hasta === b.id) || (c.desde === b.id && c.hasta === a.id),
    );
    let tramo: Position[] =
      calle && calle.geometria.length >= 2 ? calle.geometria : [[a.lng, a.lat], [b.lng, b.lat]];
    if (calle && calle.geometria.length >= 2 && calle.desde !== a.id) tramo = [...tramo].reverse();
    // Se omite el primer punto de cada tramo después del primero: repite el final del anterior.
    coordenadas.push(...(coordenadas.length === 0 ? tramo : tramo.slice(1)));
  }

  const features: Feature<LineString, { pasos: number }>[] =
    coordenadas.length >= 2
      ? [{ type: "Feature", geometry: { type: "LineString", coordinates: coordenadas }, properties: { pasos: ruta.length - 1 } }]
      : [];
  return { type: "FeatureCollection", features };
}
