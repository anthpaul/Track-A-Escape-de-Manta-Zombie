import assert from "node:assert/strict";
import { it } from "node:test";
import { Hono } from "hono";
import { crearRutaPaso, type OpcionesRutaPaso } from "./paso";
import { contextoGrafo } from "../motor/motor";
import type { MundoTurno } from "../motor/fuente-mundo";

const key = "local-route-regression-key-32-characters";
const nodoActual = "N-0001";
const vecino = contextoGrafo.indexado.vecinos(nodoActual)[0]!;
const world: MundoTurno = { partidaId: "local-game", turno: 1, zombies: [], aristasBloqueadas: [] };

async function request(overrides: Partial<OpcionesRutaPaso> = {}) {
  const app = new Hono();
  app.route("/api/paso", crearRutaPaso({
    fuente: { obtenerTurno: async () => world },
    resolver: { resolverPartidaId: async () => "local-game" },
    apiKey: key,
    ...overrides,
  }));
  return app.request("/api/paso", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ sobrevivienteId: "S-0001", nodoActual, turno: 1 }),
  });
}

function returnNode(siguienteNodo: string): NonNullable<OpcionesRutaPaso["calcularPaso"]> {
  return () => ({ siguienteNodo, resultado: { tipo: "sin_ruta", nodo: nodoActual } });
}

it("production factory rejects a non-neighbor even when its ID matches the schema", async () => {
  const nonNeighbor = [...contextoGrafo.coordenadas.keys()].find((nodo) =>
    nodo !== nodoActual && !contextoGrafo.indexado.vecinos(nodoActual).includes(nodo))!;
  const res = await request({ calcularPaso: returnNode(nonNeighbor) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { siguienteNodo: nodoActual });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

it("production factory rejects a neighbor reached through a blocked street", async () => {
  const blocked: MundoTurno = { ...world, aristasBloqueadas: [contextoGrafo.indexado.calleEntre(nodoActual, vecino)!.id] };
  const res = await request({ fuente: { obtenerTurno: async () => blocked }, calcularPaso: returnNode(vecino) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { siguienteNodo: nodoActual });
});

it("production factory preserves a valid neighboring step", async () => {
  const res = await request({ calcularPaso: returnNode(vecino) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { siguienteNodo: vecino });
});

it("production factory catches motor errors and uses the known danger snapshot for fallback", async () => {
  const dangerous: MundoTurno = { ...world, zombies: [{ id: "Z-0001", tipo: "caminante", nodo: nodoActual }] };
  const res = await request({
    fuente: { obtenerTurno: async () => dangerous },
    calcularPaso: () => { throw new Error("motor failure"); },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { siguienteNodo: string };
  assert.notEqual(body.siguienteNodo, nodoActual);
  assert.ok(contextoGrafo.indexado.esMovimientoValido(nodoActual, body.siguienteNodo, []));
});

it("production factory rejects requests when the configured key is empty", async () => {
  const res = await request({ apiKey: "" });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
