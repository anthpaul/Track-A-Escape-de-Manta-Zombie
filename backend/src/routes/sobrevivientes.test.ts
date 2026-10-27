import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { crearGrafo, type Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import { crearContextoGrafo } from "../motor/astar";
import { ErrorEstado, type RespuestaEstado } from "../db/estado-repo";
import { crearRutaSobrevivientes } from "./sobrevivientes";

const contexto = crearContextoGrafo(fixture as Grafo, crearGrafo(fixture));

const ESTADO: RespuestaEstado = {
  turno: 42,
  ronda: 1,
  zombies: [],
  aristasBloqueadas: [],
  sobrevivientes: [
    { id: "S-0001", nodo: "N-0003", estado: "en_ruta" },
    { id: "S-0002", nodo: "N-0001", estado: "a_salvo", refugio: "R-01" },
    { id: "S-0003", nodo: "N-0005", estado: "mordido" },
  ],
  metricas: { vivos: 1, aSalvo: 1, mordidos: 1, p95ms: null },
  generadoEn: "2026-10-27T12:00:00.000Z",
};

function app(obtenerEstado: () => Promise<RespuestaEstado>): Hono {
  const raiz = new Hono().basePath("/api");
  raiz.route("/sobrevivientes", crearRutaSobrevivientes({ obtenerEstado }, contexto));
  return raiz;
}

const pedir = (a: Hono, id: string) => a.request(`/api/sobrevivientes/${id}/ruta`);

test("a survivor on the road gets its full planned route from the last complete turn", async () => {
  const res = await pedir(app(async () => ESTADO), "S-0001");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const cuerpo = (await res.json()) as { sobrevivienteId: string; turno: number; refugio: string; ruta: string[] };
  assert.equal(cuerpo.sobrevivienteId, "S-0001");
  assert.equal(cuerpo.turno, 42);
  assert.equal(cuerpo.ruta[0], "N-0003");
  assert.ok(["R-01", "R-02"].includes(cuerpo.refugio));
  assert.ok(cuerpo.ruta.length > 1);
});

test("a safe or bitten survivor answers an empty route with its state", async () => {
  const a = app(async () => ESTADO);
  assert.deepEqual(await (await pedir(a, "S-0002")).json(), { sobrevivienteId: "S-0002", turno: 42, refugio: "R-01", ruta: [], estado: "a_salvo" });
  assert.deepEqual(await (await pedir(a, "S-0003")).json(), { sobrevivienteId: "S-0003", turno: 42, refugio: null, ruta: [], estado: "mordido" });
});

test("no reachable shelter this turn answers the current node and the reason", async () => {
  const bloqueado = { ...ESTADO, aristasBloqueadas: ["C-0002", "C-0003"] };
  assert.deepEqual(await (await pedir(app(async () => bloqueado), "S-0001")).json(), {
    sobrevivienteId: "S-0001",
    turno: 42,
    refugio: null,
    ruta: ["N-0003"],
    motivo: "sin_ruta",
  });
});

test("an unknown survivor is a 404", async () => {
  const res = await pedir(app(async () => ESTADO), "S-0999");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false, error: { code: "SOBREVIVIENTE_NO_ENCONTRADO", message: "S-0999 is not in the active game" } });
});

test("with no game running the survivor cannot exist, so it is a 404 with the cause", async () => {
  const res = await pedir(app(async () => { throw new ErrorEstado("SIN_PARTIDA_ACTIVA", "No active game at the moment"); }), "S-0001");
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "SIN_PARTIDA_ACTIVA");
});

test("an id outside the contract format is a 400", async () => {
  const res = await pedir(app(async () => ESTADO), "89");
  assert.equal(res.status, 400);
});
