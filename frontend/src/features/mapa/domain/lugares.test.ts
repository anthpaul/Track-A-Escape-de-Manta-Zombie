import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaPersona, lugarDeNodo, nombreSobreviviente, refugioMasCercano } from "./lugares";
import type { Grafo } from "./tipos";

const grafo: Grafo = {
  version: "t",
  nodos: [
    { id: "N-0001", lat: -0.95, lng: -80.72, barrio: "los_esteros" },
    { id: "N-0002", lat: -0.95, lng: -80.71 },
    { id: "N-0003", lat: -0.95, lng: -80.7 },
    { id: "N-0004", lat: -0.95, lng: -80.6 },
  ],
  calles: [],
  refugios: [
    { id: "R-01", nodo: "N-0003", nombre: "Faro de Manta", capacidad: 200 },
    { id: "R-02", nodo: "N-0004", nombre: "Aeropuerto Eloy Alfaro", capacidad: 200 },
  ],
};

test("survivor ids read as a person, not a code", () => {
  assert.equal(nombreSobreviviente("S-0005"), "Sobreviviente 5");
  assert.equal(nombreSobreviviente("S-0150"), "Sobreviviente 150");
});

test("an id outside the contract format is shown as it comes", () => {
  assert.equal(nombreSobreviviente("raro"), "raro");
});

test("a node in one of the four start neighbourhoods is named by it", () => {
  assert.equal(lugarDeNodo(grafo, "N-0001"), "en Los Esteros");
});

test("any other node is placed near its closest shelter", () => {
  assert.equal(lugarDeNodo(grafo, "N-0002"), "cerca de Faro de Manta");
});

test("an unknown node never shows a raw code", () => {
  assert.equal(lugarDeNodo(grafo, "N-9999"), "en un punto desconocido");
});

test("the closest shelter is found by distance", () => {
  assert.equal(refugioMasCercano(grafo, grafo.nodos[1])?.id, "R-01");
  assert.equal(refugioMasCercano(grafo, undefined), undefined);
});

test("the map label says when the followed person was bitten or is already safe", () => {
  assert.equal(etiquetaPersona("S-0019", "en_ruta"), "Sobreviviente 19");
  assert.equal(etiquetaPersona("S-0019", "mordido"), "Sobreviviente 19 · mordido");
  assert.equal(etiquetaPersona("S-0019", "a_salvo"), "Sobreviviente 19 · a salvo");
});
