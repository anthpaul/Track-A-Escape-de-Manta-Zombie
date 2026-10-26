import { test } from "node:test";
import assert from "node:assert/strict";
import { callesAGeoJSON, refugiosAGeoJSON } from "../geojson";
import { grafoMini } from "./grafo-mini";

test("every mock street and shelter points to an existing node", () => {
  assert.equal(callesAGeoJSON(grafoMini).features.length, grafoMini.calles.length);
  assert.equal(refugiosAGeoJSON(grafoMini).features.length, grafoMini.refugios.length);
});

test("the mock graph has at least one bridge, like the real one must", () => {
  assert.ok(grafoMini.calles.some((c) => c.tipo === "puente"));
});

test("mock ids follow the contract format", () => {
  assert.ok(grafoMini.nodos.every((n) => /^N-\d{4}$/.test(n.id)));
  assert.ok(grafoMini.calles.every((c) => /^C-\d{4}$/.test(c.id)));
});
