import { test } from "node:test";
import assert from "node:assert/strict";
import { callesAGeoJSON, refugiosAGeoJSON } from "@/features/mapa/map/geojson/grafo";
import { grafoMini } from "@/features/mapa/data/mock/grafo-mini";

test("every mock street and shelter points to an existing node", () => {
  assert.equal(callesAGeoJSON(grafoMini).features.length, grafoMini.calles.length);
  assert.equal(refugiosAGeoJSON(grafoMini).features.length, grafoMini.refugios.length);
});

test("the mock graph has at least one bridge, like the real one must", () => {
  assert.ok(grafoMini.calles.some((c) => c.tipo === "puente"));
});

test("every mock street carries the coordinates of its two nodes, never an empty geometry", () => {
  const porId = new Map(grafoMini.nodos.map((n) => [n.id, n]));
  for (const calle of grafoMini.calles) {
    const desde = porId.get(calle.desde)!;
    const hasta = porId.get(calle.hasta)!;
    assert.deepEqual(calle.geometria, [
      [desde.lng, desde.lat],
      [hasta.lng, hasta.lat],
    ]);
  }
});

test("mock ids follow the contract format", () => {
  assert.ok(grafoMini.nodos.every((n) => /^N-\d{4}$/.test(n.id)));
  assert.ok(grafoMini.calles.every((c) => /^C-\d{4}$/.test(c.id)));
});
