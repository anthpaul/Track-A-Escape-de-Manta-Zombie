/**
 * K3 /paso route tests — HOJA_DE_RUTA §4.1 item 5.
 *
 * Acceptance criteria:
 *   - 401 without API key or with wrong key
 *   - 400 with invalid body
 *   - Never 500 (safe fallback on any internal error)
 *   - Response shape is exactly { siguienteNodo } (no envelope on 200)
 *   - 300 ms internal budget: timeout returns nodoActual
 *   - esMovimientoValido is respected (siguienteNodo is always a valid node)
 *
 * All tests use the Hono app directly (no real DynamoDB, no real AWS).
 * FuenteMundo and PartidaActivaResolver are replaced with in-memory fakes
 * injected through the testable factory exported by paso.ts.
 *
 * Note: the production route (rutaPaso) creates real AWS clients at module
 * load time. Tests use createRutaPasoParaTests() which accepts injectable
 * dependencies.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { FuenteMundo, MundoTurno } from "../motor/fuente-mundo";
import { ErrorFuenteMundo } from "../motor/fuente-mundo";
import { createRutaPasoParaTests } from "./paso.test-factory";
import { contextoGrafo } from "../motor/motor";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_KEY = "test-api-key-that-is-at-least-32-chars!!";
const VALID_BODY = { sobrevivienteId: "S-0001", nodoActual: "N-0001", turno: 1 };

/** Minimal world: survivor at N-0001, no zombies, no blocked edges. */
const WORLD_SAFE: MundoTurno = Object.freeze({
  partidaId: "test-game",
  turno: 1,
  zombies: [],
  aristasBloqueadas: [],
});

/** Fake FuenteMundo that always returns WORLD_SAFE. */
const fuente_safe: FuenteMundo = { obtenerTurno: async () => WORLD_SAFE };

/** Fake FuenteMundo that always throws a domain error. */
const fuente_error: FuenteMundo = {
  obtenerTurno: async () => {
    throw new ErrorFuenteMundo("TURN_NOT_FOUND", "No world data");
  },
};

/** Fake FuenteMundo that hangs forever (simulates a slow DynamoDB). */
const fuente_hang: FuenteMundo = {
  obtenerTurno: () => new Promise(() => { /* never resolves */ }),
};

function makeApp(
  fuente: FuenteMundo,
  apiKey = VALID_KEY,
  budgetMs = 300,
  partidaId = "test-game",
): Hono {
  const app = new Hono();
  const ruta = createRutaPasoParaTests({ fuente, apiKey, budgetMs, partidaId });
  app.route("/api/paso", ruta);
  return app;
}

async function post(
  app: Hono,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request("/api/paso", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// §K3 — Authentication
// ---------------------------------------------------------------------------

describe("K3 authentication", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, {});
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error?.code, "UNAUTHORIZED");
  });

  it("returns 401 when x-api-key is wrong", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, { "x-api-key": "wrong-key" });
    assert.equal(res.status, 401);
  });

  it("returns 401 when x-api-key is empty string", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, { "x-api-key": "" });
    assert.equal(res.status, 401);
  });

  it("rejects an incorrect suffix beyond byte 256", async () => {
    const key = "x".repeat(256) + "correct";
    const app = makeApp(fuente_safe, key);
    const res = await post(app, VALID_BODY, { "x-api-key": "x".repeat(256) + "incorre" });
    assert.equal(res.status, 401);
  });

  it("accepts a correct x-api-key and proceeds to body validation", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, { "x-api-key": VALID_KEY });
    // Should not be 401
    assert.notEqual(res.status, 401);
  });

  it("is not vulnerable to a trivial timing difference (key and '' differ at char 0)", async () => {
    // This test does not measure timing — it verifies that the comparison
    // function returns false for any prefix of the correct key.
    const app = makeApp(fuente_safe);
    for (const partial of [
      VALID_KEY.slice(0, 1),
      VALID_KEY.slice(0, 16),
      VALID_KEY + "x",
    ]) {
      const res = await post(app, VALID_BODY, { "x-api-key": partial });
      assert.equal(res.status, 401, `partial key "${partial}" should be rejected`);
    }
  });
});

// ---------------------------------------------------------------------------
// §K3 — Body validation
// ---------------------------------------------------------------------------

describe("K3 body validation", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("returns 400 when body is not JSON", async () => {
    const app = makeApp(fuente_safe);
    const res = await app.request("/api/paso", {
      method: "POST",
      headers: { ...headers, "Content-Type": "text/plain" },
      body: "not json{{{",
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when sobrevivienteId is missing", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, { nodoActual: "N-0001", turno: 1 }, headers);
    assert.equal(res.status, 400);
  });

  it("returns 400 when nodoActual has wrong format (no N- prefix)", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, { ...VALID_BODY, nodoActual: "0001" }, headers);
    assert.equal(res.status, 400);
  });

  it("returns 400 when sobrevivienteId has wrong format (S-1 too short)", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, { ...VALID_BODY, sobrevivienteId: "S-1" }, headers);
    assert.equal(res.status, 400);
  });

  it("returns 400 when turno is negative", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, { ...VALID_BODY, turno: -1 }, headers);
    assert.equal(res.status, 400);
  });

  it("returns 400 when turno is not an integer", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, { ...VALID_BODY, turno: 1.5 }, headers);
    assert.equal(res.status, 400);
  });

  it("returns 400 when body is an empty object", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, {}, headers);
    assert.equal(res.status, 400);
  });

  it("accepts a valid body and returns 200", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, headers);
    assert.equal(res.status, 200);
  });
});

// ---------------------------------------------------------------------------
// §K3 — Response shape
// ---------------------------------------------------------------------------

describe("K3 response shape", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("200 response is exactly { siguienteNodo } — no envelope", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, headers);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const json = await res.json() as Record<string, unknown>;
    const keys = Object.keys(json);
    assert.deepEqual(keys, ["siguienteNodo"],
      `response must only contain siguienteNodo, got: ${keys.join(", ")}`);
  });

  it("siguienteNodo matches the N-DDDD format", async () => {
    const app = makeApp(fuente_safe);
    const res = await post(app, VALID_BODY, headers);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.match(siguienteNodo, /^N-\d{4}$/, "siguienteNodo must be a valid node ID");
  });

  it("siguienteNodo is the current node when the survivor is already at a shelter", async () => {
    const nodoRefugio = contextoGrafo.refugios[0]!.nodo;
    const app = makeApp(fuente_safe);
    const res = await post(app, { ...VALID_BODY, nodoActual: nodoRefugio }, headers);
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    // ya_en_refugio → motor returns nodoActual
    assert.equal(siguienteNodo, nodoRefugio);
  });
});

// ---------------------------------------------------------------------------
// §K3 — Never 500
// ---------------------------------------------------------------------------

describe("K3 never returns 500", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("returns a safe fallback (nodoActual) when FuenteMundo throws", async () => {
    const app = makeApp(fuente_error);
    const res = await post(app, VALID_BODY, headers);
    // Must not be 500
    assert.notEqual(res.status, 500, "route must not return 500 on FuenteMundo error");
    // Must still be a valid /paso response
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual,
      "safe fallback must be the current node");
  });

  it("returns a safe fallback when the resolver throws (no active partition)", async () => {
    const app = makeApp(fuente_safe);
    // Override with a version that has no active partition configured.
    const ruta = createRutaPasoParaTests({
      fuente: fuente_safe,
      apiKey: VALID_KEY,
      budgetMs: 300,
      partidaId: null, // triggers NO_ACTIVE_PARTITION error
    });
    const localApp = new Hono();
    localApp.route("/api/paso", ruta);
    const res = await post(localApp, VALID_BODY, headers);
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual);
  });

  it("returns a safe fallback when FuenteMundo hangs beyond the budget", async () => {
    // Budget of 50 ms — the hanging fuente will never resolve.
    const app = makeApp(fuente_hang, VALID_KEY, 50);
    const res = await post(app, VALID_BODY, headers);
    assert.equal(res.status, 200,
      "timed-out request must still return 200 with the fallback node");
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual,
      "timed-out request must return nodoActual as the safe fallback");
  });
});

// ---------------------------------------------------------------------------
// §K3 — Internal budget
// ---------------------------------------------------------------------------

describe("K3 internal 300 ms budget", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("returns within the allotted budget even when the fuente is slow", async () => {
    // Slow fuente that resolves after 80 ms (still within 300 ms).
    const slow: FuenteMundo = {
      obtenerTurno: () =>
        new Promise((resolve) => setTimeout(() => resolve(WORLD_SAFE), 80)),
    };
    const app = makeApp(slow, VALID_KEY, 300);
    const start = Date.now();
    const res = await post(app, VALID_BODY, headers);
    const elapsed = Date.now() - start;
    assert.equal(res.status, 200);
    assert.ok(elapsed < 400, `expected < 400 ms, got ${elapsed} ms`);
  });

  it("fires the fallback when the budget expires", async () => {
    // Budget of 20 ms, fuente takes 200 ms → must trigger fallback.
    const slow: FuenteMundo = {
      obtenerTurno: () =>
        new Promise((resolve) => setTimeout(() => resolve(WORLD_SAFE), 200)),
    };
    const app = makeApp(slow, VALID_KEY, 20);
    const res = await post(app, VALID_BODY, headers);
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual,
      "budget expiry must return nodoActual");
  });
});

// ---------------------------------------------------------------------------
// §K3 — esMovimientoValido respected (output is always a valid node)
// ---------------------------------------------------------------------------

describe("K3 siguienteNodo is always a reachable neighbour or the same node", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("result is either nodoActual or a known graph neighbour", async () => {
    const app = makeApp(fuente_safe);
    // Test a few fixture nodes.
    for (const nodoActual of ["N-0001", "N-0006", "N-0010", "N-0012"]) {
      const res = await post(app, { ...VALID_BODY, nodoActual }, headers);
      assert.equal(res.status, 200);
      const { siguienteNodo } = await res.json() as { siguienteNodo: string };
      assert.ok(contextoGrafo.indexado.esMovimientoValido(nodoActual, siguienteNodo, []));
    }
  });

  it("stays at current node when all exits are blocked", async () => {
    const nodoActual = "N-0003";
    const blockedWorld: MundoTurno = {
      ...WORLD_SAFE,
      aristasBloqueadas: contextoGrafo.indexado.vecinos(nodoActual).map((vecino) =>
        contextoGrafo.indexado.calleEntre(nodoActual, vecino)!.id),
    };
    const fuente_blocked: FuenteMundo = {
      obtenerTurno: async () => blockedWorld,
    };
    const app = makeApp(fuente_blocked);
    const res = await post(
      app,
      { ...VALID_BODY, nodoActual: "N-0003" },
      headers,
    );
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, "N-0003",
      "must stay put when all exits are blocked");
  });
});
