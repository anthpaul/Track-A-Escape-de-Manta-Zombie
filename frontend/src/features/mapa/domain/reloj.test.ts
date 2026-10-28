import { test } from "node:test";
import assert from "node:assert/strict";
import { horaDelTurno } from "./reloj";

test("each turn is one minute of the night of October 31, starting at 21:30", () => {
  assert.deepEqual(horaDelTurno(0), { fecha: "31 OCT 2026", hora: "21:30" });
  assert.deepEqual(horaDelTurno(1), { fecha: "31 OCT 2026", hora: "21:31" });
  assert.deepEqual(horaDelTurno(149), { fecha: "31 OCT 2026", hora: "23:59" });
});

test("a round that runs past midnight moves to November 1", () => {
  assert.deepEqual(horaDelTurno(150), { fecha: "1 NOV 2026", hora: "00:00" });
  assert.deepEqual(horaDelTurno(275), { fecha: "1 NOV 2026", hora: "02:05" });
});
