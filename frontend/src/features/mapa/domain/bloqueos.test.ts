import { test } from "node:test";
import assert from "node:assert/strict";
import { actualizarBloqueos, textoBloqueo } from "./bloqueos";

test("streets already blocked on the first snapshot have an unknown start", () => {
  const b = actualizarBloqueos(null, 23, ["C-0001"]);
  assert.equal(b.desde.get("C-0001"), null);
});

test("on turn 1 every blocked street starts on turn 1", () => {
  assert.equal(actualizarBloqueos(null, 1, ["C-0001"]).desde.get("C-0001"), 1);
});

test("a street that becomes blocked later keeps the first turn it was seen", () => {
  let b = actualizarBloqueos(null, 20, []);
  b = actualizarBloqueos(b, 21, ["C-0002"]);
  b = actualizarBloqueos(b, 22, ["C-0002"]);
  assert.equal(b.desde.get("C-0002"), 21);
});

test("a street that reopens is forgotten", () => {
  let b = actualizarBloqueos(null, 1, ["C-0001"]);
  b = actualizarBloqueos(b, 2, []);
  assert.equal(b.desde.has("C-0001"), false);
});

test("a new round (the turn goes back) starts over", () => {
  let b = actualizarBloqueos(null, 1, []);
  b = actualizarBloqueos(b, 40, ["C-0001"]);
  b = actualizarBloqueos(b, 1, ["C-0001"]);
  assert.equal(b.desde.get("C-0001"), 1);
});

test("the card text names the kind of street and the turn when known", () => {
  assert.deepEqual(textoBloqueo("puente", 21), { titulo: "Puente dañado", detalle: "Nadie puede cruzar desde el turno 21" });
  assert.deepEqual(textoBloqueo("calle", null), { titulo: "Calle cerrada", detalle: "Nadie puede cruzar" });
});
