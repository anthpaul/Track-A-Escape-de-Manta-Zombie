import { test } from "node:test";
import assert from "node:assert/strict";
import { refugiosSinAccesoAGeoJSON, sobrevivientesAGeoJSON, vehiculosAGeoJSON, zombiesAGeoJSON, zonasHordaAGeoJSON } from "@/features/mapa/map/geojson/entidades";
import type { Grafo } from "@/features/mapa/domain/tipos";

// N-0001 — N-0002 — N-0003 — N-0004 (a line)
const grafo: Grafo = {
  version: "test",
  nodos: [1, 2, 3, 4].map((i) => ({ id: `N-000${i}`, lat: -0.95 - i / 1000, lng: -80.72 })),
  calles: [
    { id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 100, tipo: "calle", geometria: [] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 100, tipo: "calle", geometria: [] },
    { id: "C-0003", desde: "N-0003", hasta: "N-0004", distancia_m: 100, tipo: "calle", geometria: [] },
  ],
  refugios: [],
};

test("horde zones mark the horde node and its neighbors separately", () => {
  const fc = zonasHordaAGeoJSON(grafo, [{ id: "Z-1", tipo: "horda", nodo: "N-0001" }]);
  assert.deepEqual(
    fc.features.map((f) => f.properties),
    [{ nodo: "N-0001", origen: "horda" }, { nodo: "N-0002", origen: "vecino" }],
  );
});

test("zombies become points with their type; sleepers and unknown nodes are never drawn", () => {
  const fc = zombiesAGeoJSON(grafo, [
    { id: "Z-1", tipo: "corredor", nodo: "N-0003" },
    { id: "Z-2", tipo: "dormido", nodo: "N-0001" },
    { id: "Z-3", tipo: "caminante", nodo: "N-9999" },
  ]);
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].properties, { id: "Z-1", tipo: "corredor" });
  assert.deepEqual(fc.features[0].geometry.coordinates, [-80.72, -0.953]);
});

test("survivors become points with their state", () => {
  const fc = sobrevivientesAGeoJSON(grafo, [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta", siguienteNodo: "N-0002" },
    { id: "S-0002", nodo: "N-0004", estado: "mordido" },
  ]);
  assert.deepEqual(fc.features.map((f) => f.properties), [
    { id: "S-0001", estado: "en_ruta" },
    { id: "S-0002", estado: "mordido" },
  ]);
});

test("cut-off shelters become points with their name; reachable ones are not drawn", () => {
  const conRefugios: Grafo = {
    ...grafo,
    refugios: [
      { id: "R-01", nodo: "N-0004", nombre: "Faro", capacidad: 10 },
      { id: "R-02", nodo: "N-0002", nombre: "ULEAM", capacidad: 10 },
    ],
  };
  // The horde on N-0003 forbids N-0002..N-0004: both shelters are cut off from the survivor on N-0001.
  const mundo = {
    zombies: [{ id: "Z-1", tipo: "horda" as const, nodo: "N-0003" }],
    aristasBloqueadas: [],
    sobrevivientes: [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" as const }],
  };
  assert.deepEqual(
    refugiosSinAccesoAGeoJSON(conRefugios, mundo).features.map((f) => f.properties),
    [{ id: "R-01", nombre: "Faro" }, { id: "R-02", nombre: "ULEAM" }],
  );
  assert.deepEqual(refugiosSinAccesoAGeoJSON(conRefugios, { ...mundo, zombies: [] }).features, []);
});

test("people riding a rescue van are not drawn on foot: the van carries them", () => {
  const fc = sobrevivientesAGeoJSON(grafo, [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta" },
    { id: "S-0002", nodo: "N-0002", estado: "en_ruta", vehiculo: "V-1" },
  ]);
  assert.deepEqual(fc.features.map((f) => f.properties.id), ["S-0001"]);
});

test("rescue vans become points with how many people they carry and a short name", () => {
  const fc = vehiculosAGeoJSON(grafo, [
    { id: "V-1", nodo: "N-0001", pasajeros: ["S-0001", "S-0002"], destino: "N-0004" },
    { id: "V-2", nodo: "N-9999", pasajeros: [], destino: null }, // unknown node: never drawn
  ]);
  assert.deepEqual(fc.features.map((f) => f.properties), [{ id: "V-1", nombre: "Camioneta 1", pasajeros: 2 }]);
  assert.deepEqual(vehiculosAGeoJSON(grafo, undefined).features, []);
});
