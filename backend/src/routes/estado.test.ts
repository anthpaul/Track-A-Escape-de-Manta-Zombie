/**
 * Tests de GET /api/estado: criterios de aceptación de S5.
 *
 * Todos los tests usan clientes falsos de DynamoDB; no hay llamadas reales a AWS.
 * Se prueba a través de la app de Hono (estilo integración), así también se
 * verifica el cableado de la ruta.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { app } from "../handler";
import { EstadoRepo } from "../db/estado-repo";
import { crearRutaEstado } from "./estado";
import { Hono } from "hono";
import { KEYS } from "../db/keys";

// ---------------------------------------------------------------------------
// Constructor del cliente falso de DynamoDB
// ---------------------------------------------------------------------------

type FakeItems = {
  control?: unknown;
  turnos?: unknown[];
};

function crearClienteFake({ control, turnos = [] }: FakeItems = {}) {
  return {
    send(command: GetCommand | QueryCommand): Promise<{ Item?: unknown; Items?: unknown[] }> {
      // Se detecta por la presencia de campos clave en lugar de instanceof, para
      // evitar problemas de identidad de módulos con varios require() en los tests.
      const input = command.input as Record<string, unknown>;
      if ("Key" in input) {
        // GetCommand
        const key = input.Key as { PK: string; SK: string };
        if (key.PK === "CONTROL" && key.SK === "PARTIDA_ACTIVA") {
          return Promise.resolve({ Item: control });
        }
        return Promise.resolve({ Item: undefined });
      }
      // QueryCommand → devuelve la lista de turnos
      return Promise.resolve({ Items: turnos });
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AHORA_MS = 1_700_000_000_000;  // reloj fijo para los tests
const AHORA_S = Math.floor(AHORA_MS / 1000);

const candadoValido = {
  PK: "CONTROL",
  SK: "PARTIDA_ACTIVA",
  partidaId: "demo-r1-12345",
  modo: "demo",
  turnoActual: 5,
  expiraEn: AHORA_S + 30,  // no expirado
};

const turnoCompletoDato = {
  partidaId: "demo-r1-12345",
  ronda: 1,
  turno: 5,
  completo: true,
  zombies: [{ id: "Z-0001", tipo: "caminante", nodo: "N-0001" }],
  aristasBloqueadas: [],
  sobrevivientes: [
    { id: "S-0001", nodo: "N-0002", estado: "en_ruta", siguienteNodo: "N-0003" },
    { id: "S-0002", nodo: "N-0050", estado: "a_salvo" },
    { id: "S-0003", nodo: "N-0100", estado: "mordido" },
  ],
};

// Forma del ítem de DynamoDB que envuelve el campo data
const itemTurno = {
  PK: `PARTIDA#demo-r1-12345`,
  SK: KEYS.turno("demo-r1-12345", 5).SK,
  ttl: AHORA_S + 86400,
  data: turnoCompletoDato,
};

// ---------------------------------------------------------------------------
// Auxiliar: arma una app de Hono de prueba con el repositorio inyectado
// ---------------------------------------------------------------------------

function crearAppTest(items: FakeItems = {}) {
  const cliente = crearClienteFake(items);
  const repo = new EstadoRepo(cliente, "spookython_mundo", () => AHORA_MS);
  const testApp = new Hono().basePath("/api");
  testApp.get("/estado", crearRutaEstado(repo));
  return testApp;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("returns the last complete turn when a game is active", async () => {
  const testApp = crearAppTest({
    control: candadoValido,
    turnos: [itemTurno],
  });

  const res = await testApp.request("/api/estado");
  assert.equal(res.status, 200);

  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.turno, 5);
  assert.equal(body.ronda, 1);
  assert.ok(Array.isArray(body.zombies));
  assert.equal((body.zombies as unknown[]).length, 1);
  assert.ok(Array.isArray(body.sobrevivientes));
  assert.equal((body.sobrevivientes as unknown[]).length, 3);
  assert.ok(typeof body.generadoEn === "string", "generadoEn must be an ISO string");
  assert.ok((body.generadoEn as string).includes("T"), "generadoEn must be ISO 8601");
});

test("metricas.p95ms relays the p95 the simulator stored in the turn, and is null when absent", async () => {
  const conP95 = { ...itemTurno, data: { ...turnoCompletoDato, p95ms: 96.2 } };
  const res = await crearAppTest({ control: candadoValido, turnos: [conP95] }).request("/api/estado");
  assert.equal(((await res.json()) as { metricas: { p95ms: number | null } }).metricas.p95ms, 96.2);

  const sinP95 = await crearAppTest({ control: candadoValido, turnos: [itemTurno] }).request("/api/estado");
  assert.equal(((await sinP95.json()) as { metricas: { p95ms: number | null } }).metricas.p95ms, null);
});

test("metricas counts vivos / a_salvo / mordidos correctly", async () => {
  const testApp = crearAppTest({
    control: candadoValido,
    turnos: [itemTurno],
  });

  const res = await testApp.request("/api/estado");
  const body = await res.json() as { metricas: { vivos: number; aSalvo: number; mordidos: number } };
  assert.equal(body.metricas.vivos, 1);
  assert.equal(body.metricas.aSalvo, 1);
  assert.equal(body.metricas.mordidos, 1);
});

test("returns ok:false when no game is active (no CONTROL item)", async () => {
  const testApp = crearAppTest({ control: undefined });

  const res = await testApp.request("/api/estado");
  assert.equal(res.status, 200);

  const body = await res.json() as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SIN_PARTIDA_ACTIVA");
});

test("returns ok:false when the game lock has expired", async () => {
  const candadoExpirado = { ...candadoValido, expiraEn: AHORA_S - 10 };
  const testApp = crearAppTest({ control: candadoExpirado });

  const res = await testApp.request("/api/estado");
  assert.equal(res.status, 200);

  const body = await res.json() as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "PARTIDA_EXPIRADA");
});

test("returns ok:false when no complete turn exists yet", async () => {
  // El candado es válido, pero todavía no se escribió ningún turno.
  const testApp = crearAppTest({ control: candadoValido, turnos: [] });

  const res = await testApp.request("/api/estado");
  assert.equal(res.status, 200);

  const body = await res.json() as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SIN_TURNO_COMPLETO");
});

test("skips incomplete turns and returns the last complete one", async () => {
  const turnoIncompleto = {
    ...itemTurno,
    SK: KEYS.turno("demo-r1-12345", 6).SK,
    data: { ...turnoCompletoDato, turno: 6, completo: false },
  };
  const testApp = crearAppTest({
    control: candadoValido,
    // DynamoDB devuelve primero el más nuevo; el turno 6 está incompleto y el 5, completo.
    turnos: [turnoIncompleto, itemTurno],
  });

  const res = await testApp.request("/api/estado");
  const body = await res.json() as { turno: number };
  assert.equal(body.turno, 5, "must skip incomplete turn 6 and return complete turn 5");
});

test("dormido zombies are filtered out from the response", async () => {
  const turnoConDormido = {
    ...itemTurno,
    data: {
      ...turnoCompletoDato,
      // ZombieVisibleSchema solo admite caminante/corredor/horda en los turnos de shared,
      // pero /estado agrega un filtro defensivo extra.
      zombies: [
        { id: "Z-0001", tipo: "caminante", nodo: "N-0001" },
      ],
    },
  };
  const testApp = crearAppTest({ control: candadoValido, turnos: [turnoConDormido] });

  const res = await testApp.request("/api/estado");
  const body = await res.json() as { zombies: unknown[] };
  assert.ok(body.zombies.every((z: unknown) => (z as { tipo: string }).tipo !== "dormido"));
});

test("Cache-Control header is set to no-store", async () => {
  const testApp = crearAppTest({ control: candadoValido, turnos: [itemTurno] });

  const res = await testApp.request("/api/estado");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("health endpoint is unaffected by the new route", async () => {
  const res = await app.request("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "api" });
});

test("the rescue vans of the turn are relayed as they were stored, and absent when the round has no fleet", async () => {
  const vehiculos = [{ id: "V-1", nodo: "N-0001", pasajeros: ["S-0001"], destino: "N-0002" }];
  const conFlota = { ...itemTurno, data: { ...turnoCompletoDato, vehiculos } };
  const res = await crearAppTest({ control: candadoValido, turnos: [conFlota] }).request("/api/estado");
  assert.deepEqual(((await res.json()) as { vehiculos?: unknown }).vehiculos, vehiculos);

  const sinFlota = await crearAppTest({ control: candadoValido, turnos: [itemTurno] }).request("/api/estado");
  assert.equal("vehiculos" in ((await sinFlota.json()) as object), false);
});
