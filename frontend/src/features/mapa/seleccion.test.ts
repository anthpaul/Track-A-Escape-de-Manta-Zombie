import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirSeguido, flechasAGeoJSON, rutaAGeoJSON } from "./seleccion";
import type { Grafo, Sobreviviente } from "./tipos";

// N-0001 (west) — N-0002 (east) — N-0003 (further east)
const grafo: Grafo = {
  version: "test",
  nodos: [
    { id: "N-0001", lat: -0.95, lng: -80.72 },
    { id: "N-0002", lat: -0.95, lng: -80.71 },
    { id: "N-0003", lat: -0.95, lng: -80.70 },
  ],
  calles: [
    // Drawn east → west on purpose, to check the route is reoriented.
    { id: "C-0001", desde: "N-0002", hasta: "N-0001", distancia_m: 1100, tipo: "calle",
      geometria: [[-80.71, -0.95], [-80.715, -0.951], [-80.72, -0.95]] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 1100, tipo: "calle", geometria: [] },
  ],
  refugios: [],
};

const s = (id: string, estado: Sobreviviente["estado"], nodo = "N-0001", siguienteNodo?: string): Sobreviviente =>
  ({ id, nodo, estado, siguienteNodo });

test("keeps following the current survivor while it is on the road", () => {
  assert.equal(elegirSeguido([s("S-0002", "en_ruta"), s("S-0005", "en_ruta")], "S-0005"), "S-0005");
});

test("switches to the lowest on-road id when the current one is safe or bitten", () => {
  const lista = [s("S-0009", "en_ruta"), s("S-0005", "a_salvo"), s("S-0003", "en_ruta")];
  assert.equal(elegirSeguido(lista, "S-0005"), "S-0003");
  assert.equal(elegirSeguido(lista, null), "S-0003");
});

test("follows nobody when nobody is on the road", () => {
  assert.equal(elegirSeguido([s("S-0001", "a_salvo"), s("S-0002", "mordido")], "S-0001"), null);
});

test("next-step arrows are grouped per direction and point the right way", () => {
  const { lineas, puntas } = flechasAGeoJSON(grafo, [
    s("S-0001", "en_ruta", "N-0001", "N-0002"),
    s("S-0002", "en_ruta", "N-0001", "N-0002"),
    s("S-0003", "en_ruta", "N-0002", "N-0002"), // staying: no arrow
    s("S-0004", "a_salvo", "N-0002", "N-0003"), // not on the road: no arrow
    s("S-0005", "en_ruta", "N-0001", "N-9999"), // unknown node: no arrow
  ]);
  assert.equal(lineas.features.length, 1);
  assert.equal(lineas.features[0].properties.cantidad, 2);
  assert.equal(puntas.features.length, 1);
  assert.equal(Math.round(puntas.features[0].properties.rumbo), 90); // due east
});

test("a route follows street geometry, reoriented to the walking direction", () => {
  const fc = rutaAGeoJSON(grafo, ["N-0001", "N-0002", "N-0003"]);
  assert.deepEqual(fc.features[0].geometry.coordinates, [
    [-80.72, -0.95], [-80.715, -0.951], [-80.71, -0.95], [-80.70, -0.95],
  ]);
});

test("a route with fewer than two nodes draws nothing", () => {
  assert.equal(rutaAGeoJSON(grafo, ["N-0001"]).features.length, 0);
});
