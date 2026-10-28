/**
 * Tests de la ruta /paso de K3 (HOJA_DE_RUTA §4.1, ítem 5).
 *
 * Criterios de aceptación:
 *   - 401 sin API key o con una key incorrecta
 *   - 400 con un body inválido
 *   - Nunca 500 (fallback seguro ante cualquier error interno)
 *   - La respuesta es exactamente { siguienteNodo } (sin sobre en el 200)
 *   - Presupuesto interno de 300 ms: si se agota, se devuelve nodoActual
 *   - Se respeta esMovimientoValido (siguienteNodo siempre es un nodo válido)
 *
 * Todos los tests usan la app de Hono directamente (sin DynamoDB ni AWS reales).
 * FuenteMundo y PartidaActivaResolver se reemplazan por fakes en memoria,
 * inyectados a través de la fábrica testeable que exporta paso.ts.
 *
 * Nota: la ruta de producción (rutaPaso) crea clientes reales de AWS al cargar
 * el módulo. Los tests usan createRutaPasoParaTests(), que acepta dependencias
 * inyectables.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { FuenteMundo, MundoTurno } from "../motor/fuente-mundo";
import { ErrorFuenteMundo } from "../motor/fuente-mundo";
import { createRutaPasoParaTests } from "./paso.test-factory";
import { contextoGrafo } from "../motor/motor";

// ---------------------------------------------------------------------------
// Funciones auxiliares de los tests
// ---------------------------------------------------------------------------

const VALID_KEY = "test-api-key-that-is-at-least-32-chars!!";
const VALID_BODY = { sobrevivienteId: "S-0001", nodoActual: "N-0001", turno: 1 };

/** Mundo mínimo: sobreviviente en N-0001, sin zombies ni aristas bloqueadas. */
const WORLD_SAFE: MundoTurno = Object.freeze({
  partidaId: "test-game",
  turno: 1,
  zombies: [],
  aristasBloqueadas: [],
});

/** FuenteMundo falsa que siempre devuelve WORLD_SAFE. */
const fuente_safe: FuenteMundo = { obtenerTurno: async () => WORLD_SAFE };

/** FuenteMundo falsa que siempre lanza un error de dominio. */
const fuente_error: FuenteMundo = {
  obtenerTurno: async () => {
    throw new ErrorFuenteMundo("TURN_NOT_FOUND", "No world data");
  },
};

/** FuenteMundo falsa que nunca responde (simula un DynamoDB lento). */
const fuente_hang: FuenteMundo = {
  obtenerTurno: () => new Promise(() => { /* nunca resuelve */ }),
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
// §K3: autenticación
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
    // No debería ser 401
    assert.notEqual(res.status, 401);
  });

  it("is not vulnerable to a trivial timing difference (key and '' differ at char 0)", async () => {
    // Este test no mide tiempos: verifica que la función de comparación
    // devuelva false para cualquier prefijo de la key correcta.
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
// §K3: validación del body
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
// §K3: forma de la respuesta
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
    // ya_en_refugio → el motor devuelve nodoActual
    assert.equal(siguienteNodo, nodoRefugio);
  });
});

// ---------------------------------------------------------------------------
// §K3: nunca 500
// ---------------------------------------------------------------------------

describe("K3 never returns 500", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("returns a safe fallback (nodoActual) when FuenteMundo throws", async () => {
    const app = makeApp(fuente_error);
    const res = await post(app, VALID_BODY, headers);
    // No debe ser 500
    assert.notEqual(res.status, 500, "route must not return 500 on FuenteMundo error");
    // Igual debe ser una respuesta válida de /paso
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual,
      "safe fallback must be the current node");
  });

  it("returns a safe fallback when the resolver throws (no active partition)", async () => {
    const app = makeApp(fuente_safe);
    // Se reemplaza por una versión sin partición activa configurada.
    const ruta = createRutaPasoParaTests({
      fuente: fuente_safe,
      apiKey: VALID_KEY,
      budgetMs: 300,
      partidaId: null, // provoca el error NO_ACTIVE_PARTITION
    });
    const localApp = new Hono();
    localApp.route("/api/paso", ruta);
    const res = await post(localApp, VALID_BODY, headers);
    assert.equal(res.status, 200);
    const { siguienteNodo } = await res.json() as { siguienteNodo: string };
    assert.equal(siguienteNodo, VALID_BODY.nodoActual);
  });

  it("returns a safe fallback when FuenteMundo hangs beyond the budget", async () => {
    // Presupuesto de 50 ms: la fuente colgada nunca va a resolver.
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
// §K3: presupuesto interno
// ---------------------------------------------------------------------------

describe("K3 internal 300 ms budget", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("returns within the allotted budget even when the fuente is slow", async () => {
    // Fuente lenta que resuelve a los 80 ms (todavía dentro de los 300 ms).
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
    // Presupuesto de 20 ms y la fuente tarda 200 ms → debe activarse el fallback.
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
// §K3: se respeta esMovimientoValido (la salida siempre es un nodo válido)
// ---------------------------------------------------------------------------

describe("K3 siguienteNodo is always a reachable neighbour or the same node", () => {
  const headers = { "x-api-key": VALID_KEY };

  it("result is either nodoActual or a known graph neighbour", async () => {
    const app = makeApp(fuente_safe);
    // Se prueban algunos nodos del fixture.
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
