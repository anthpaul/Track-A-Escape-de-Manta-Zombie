import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { app } from "../handler";
import { ErrorFuenteMundo, type FuenteMundo, type MundoTurno } from "./fuente-mundo";

test("a consumer can read the world through a fake source without knowing its storage", async () => {
  const expected: MundoTurno = {
    partidaId: "test-game", turno: 3,
    zombies: [{ id: "Z-0001", tipo: "horda", nodo: "N-0002" }],
    aristasBloqueadas: ["C-0001"],
  };
  const calls: [string, number][] = [];
  const fake: FuenteMundo = {
    async obtenerTurno(partidaId, turno) {
      calls.push([partidaId, turno]);
      return expected;
    },
  };
  const consume = (source: FuenteMundo) => source.obtenerTurno("test-game", 3);
  assert.deepEqual(await consume(fake), expected);
  assert.deepEqual(calls, [["test-game", 3]]);
  const contract = readFileSync(join(__dirname, "fuente-mundo.ts"), "utf8");
  assert.doesNotMatch(contract, /@aws-sdk|from ["']\.\.\/db\//);
});

test("source failures are explicit and do not turn into an empty safe world", async () => {
  const failure = new ErrorFuenteMundo("TURN_NOT_FOUND", "No world available");
  const fake: FuenteMundo = { async obtenerTurno() { throw failure; } };
  await assert.rejects(fake.obtenerTurno("test-game", 1), (error) => error === failure);
});

test("health stays independent of DynamoDB and preserves its public response", async () => {
  const response = await app.request("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "api" });
});
