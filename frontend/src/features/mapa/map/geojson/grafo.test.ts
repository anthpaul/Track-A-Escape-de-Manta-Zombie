import { test } from "node:test";
import assert from "node:assert/strict";
import { callesAGeoJSON, refugiosAGeoJSON } from "@/features/mapa/map/geojson/grafo";
import type { Grafo } from "@/features/mapa/domain/tipos";

const grafo: Grafo = {
  version: "test",
  nodos: [
    { id: "N-0001", lat: -0.95, lng: -80.72 },
    { id: "N-0002", lat: -0.951, lng: -80.721 },
    { id: "N-0003", lat: -0.952, lng: -80.722 },
  ],
  calles: [
    {
      id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 150, tipo: "avenida",
      geometria: [[-80.72, -0.95], [-80.7205, -0.9505], [-80.721, -0.951]],
    },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 140, tipo: "puente", geometria: [] },
  ],
  refugios: [{ id: "R-01", nodo: "N-0003", nombre: "Estadio Jocay", capacidad: 50 }],
};

test("each street becomes a LineString with its id, type and blocked flag", () => {
  const fc = callesAGeoJSON(grafo);
  assert.equal(fc.type, "FeatureCollection");
  assert.equal(fc.features.length, 2);
  const [avenida] = fc.features;
  assert.equal(avenida.geometry.type, "LineString");
  assert.deepEqual(avenida.geometry.coordinates, grafo.calles[0].geometria);
  assert.deepEqual(avenida.properties, { id: "C-0001", tipo: "avenida", bloqueada: false });
});

test("a street without geometry is drawn straight between its two nodes", () => {
  const puente = callesAGeoJSON(grafo).features[1];
  assert.deepEqual(puente.geometry.coordinates, [[-80.721, -0.951], [-80.722, -0.952]]);
});

test("blocked street ids are flagged", () => {
  const fc = callesAGeoJSON(grafo, new Set(["C-0002"]));
  assert.deepEqual(fc.features.map((f) => f.properties.bloqueada), [false, true]);
});

test("a street pointing to a missing node is skipped instead of breaking the map", () => {
  const roto: Grafo = {
    ...grafo,
    calles: [...grafo.calles, { id: "C-0099", desde: "N-0001", hasta: "N-9999", distancia_m: 10, tipo: "calle", geometria: [] }],
  };
  assert.deepEqual(callesAGeoJSON(roto).features.map((f) => f.properties.id), ["C-0001", "C-0002"]);
});

test("a shelter pointing to a missing node is skipped", () => {
  const roto: Grafo = {
    ...grafo,
    refugios: [...grafo.refugios, { id: "R-99", nodo: "N-9999", nombre: "Fantasma", capacidad: 1 }],
  };
  assert.deepEqual(refugiosAGeoJSON(roto).features.map((f) => f.properties.id), ["R-01"]);
});

test("each shelter becomes a Point at its node with name and capacity", () => {
  const fc = refugiosAGeoJSON(grafo);
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry, { type: "Point", coordinates: [-80.722, -0.952] });
  assert.deepEqual(fc.features[0].properties, { id: "R-01", nombre: "Estadio Jocay", capacidad: 50 });
});
