import { test } from "node:test";
import assert from "node:assert/strict";
import { flechasAGeoJSON, rutaAGeoJSON } from "@/features/mapa/map/geojson/rutas";
import type { Grafo, Sobreviviente } from "@/features/mapa/domain/tipos";

// N-0001 (oeste) — N-0002 (este) — N-0003 (más al este)
const grafo: Grafo = {
  version: "test",
  nodos: [
    { id: "N-0001", lat: -0.95, lng: -80.72 },
    { id: "N-0002", lat: -0.95, lng: -80.71 },
    { id: "N-0003", lat: -0.95, lng: -80.70 },
  ],
  calles: [
    // Dibujada este → oeste a propósito, para comprobar que la ruta se reorienta.
    { id: "C-0001", desde: "N-0002", hasta: "N-0001", distancia_m: 1100, tipo: "calle",
      geometria: [[-80.71, -0.95], [-80.715, -0.951], [-80.72, -0.95]] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 1100, tipo: "calle", geometria: [] },
  ],
  refugios: [],
};

const s = (id: string, estado: Sobreviviente["estado"], nodo = "N-0001", siguienteNodo?: string): Sobreviviente =>
  ({ id, nodo, estado, siguienteNodo });

test("next-step arrows are grouped per direction and point the right way", () => {
  const { lineas, puntas } = flechasAGeoJSON(grafo, [
    s("S-0001", "en_ruta", "N-0001", "N-0002"),
    s("S-0002", "en_ruta", "N-0001", "N-0002"),
    s("S-0003", "en_ruta", "N-0002", "N-0002"), // se queda: sin flecha
    s("S-0004", "a_salvo", "N-0002", "N-0003"), // no está en camino: sin flecha
    s("S-0005", "en_ruta", "N-0001", "N-9999"), // nodo desconocido: sin flecha
  ]);
  assert.equal(lineas.features.length, 1);
  assert.equal(lineas.features[0].properties.cantidad, 2);
  assert.equal(puntas.features.length, 1);
  assert.equal(Math.round(puntas.features[0].properties.rumbo), 90); // rumbo este exacto
});

test("a route follows street geometry, reoriented to the walking direction", () => {
  const fc = rutaAGeoJSON(grafo, ["N-0001", "N-0002", "N-0003"]);
  assert.deepEqual(fc.features[0].geometry.coordinates, [
    [-80.72, -0.95], [-80.715, -0.951], [-80.71, -0.95], [-80.70, -0.95],
  ]);
});

test("a route stops at an unknown node instead of jumping across it", () => {
  const fc = rutaAGeoJSON(grafo, ["N-0001", "N-0002", "N-9999", "N-0003"]);
  assert.deepEqual(fc.features[0].geometry.coordinates.at(-1), [-80.71, -0.95]);
});

test("a route with fewer than two nodes draws nothing", () => {
  assert.equal(rutaAGeoJSON(grafo, ["N-0001"]).features.length, 0);
});
