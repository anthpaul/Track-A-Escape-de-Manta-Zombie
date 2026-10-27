import { test } from "node:test";
import assert from "node:assert/strict";
import { leerRuta } from "@/features/mapa/data/real/ruta-api";

test("the planned route of the asked survivor is returned as node ids", () => {
  const cuerpo = { sobrevivienteId: "S-0001", turno: 4, refugio: "R-01", ruta: ["N-0003", "N-0002", "N-0001"] };
  assert.deepEqual(leerRuta(cuerpo, "S-0001"), ["N-0003", "N-0002", "N-0001"]);
});

test("safe, bitten and no-route answers are drawn as they come", () => {
  assert.deepEqual(leerRuta({ sobrevivienteId: "S-0001", turno: 4, refugio: null, ruta: [], estado: "mordido" }, "S-0001"), []);
  assert.deepEqual(leerRuta({ sobrevivienteId: "S-0001", turno: 4, refugio: null, ruta: ["N-0003"], motivo: "sin_ruta" }, "S-0001"), ["N-0003"]);
});

test("an answer for another survivor is never drawn on the selected one", () => {
  assert.equal(leerRuta({ sobrevivienteId: "S-0002", turno: 4, refugio: "R-01", ruta: ["N-0001"] }, "S-0001"), null);
});

test("error bodies and broken answers are rejected", () => {
  assert.equal(leerRuta({ ok: false, error: { code: "SOBREVIVIENTE_NO_ENCONTRADO" } }, "S-0001"), null);
  assert.equal(leerRuta({ sobrevivienteId: "S-0001", ruta: "N-0001" }, "S-0001"), null);
  assert.equal(leerRuta(null, "S-0001"), null);
});
