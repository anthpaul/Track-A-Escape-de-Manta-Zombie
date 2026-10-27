import { test } from "node:test";
import assert from "node:assert/strict";
import { conVisibilidad, filtroZombies } from "./visibilidad";

const todas = { caminante: true, corredor: true, horda: true, sobreviviente: true, mordido: true, refugio: true };

test("the zombie filter only keeps the switched-on types", () => {
  assert.deepEqual(filtroZombies({ ...todas, corredor: false }), ["in", ["get", "tipo"], ["literal", ["caminante", "horda"]]]);
  assert.deepEqual(filtroZombies({ ...todas, caminante: false, corredor: false, horda: false }), ["in", ["get", "tipo"], ["literal", []]]);
});

test("visibility keeps the rest of the layout and sets visible or none", () => {
  const capa = { id: "x", type: "symbol", layout: { "icon-image": "flecha" } } as const;
  assert.deepEqual(conVisibilidad(capa, false), { id: "x", type: "symbol", layout: { "icon-image": "flecha", visibility: "none" } });
  assert.equal((conVisibilidad(capa, true) as { layout: { visibility: string } }).layout.visibility, "visible");
});
