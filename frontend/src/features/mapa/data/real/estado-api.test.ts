import { test } from "node:test";
import assert from "node:assert/strict";
import { leerEstado } from "@/features/mapa/data/real/estado-api";
import { grafoMini } from "@/features/mapa/data/mock/grafo-mini";

const [norte, sur] = grafoMini.refugios;

// Forma que devuelve hoy backend/src/routes/estado.ts: todavía sin el campo "refugios".
const respuestaReal = {
  turno: 12,
  ronda: 2,
  zombies: [{ id: "Z-0001", tipo: "corredor", nodo: "N-0005" }],
  aristasBloqueadas: ["C-0004"],
  sobrevivientes: [
    { id: "S-0001", nodo: "N-0002", estado: "en_ruta", siguienteNodo: "N-0003", refugio: norte.id, callesRestantes: 2 },
    { id: "S-0002", nodo: norte.nodo, estado: "a_salvo" },
    { id: "S-0003", nodo: norte.nodo, estado: "a_salvo" },
    { id: "S-0004", nodo: "N-0006", estado: "mordido" },
  ],
  metricas: { vivos: 1, aSalvo: 2, mordidos: 1, p95ms: null },
  generadoEn: "2026-10-27T12:00:00.000Z",
};

test("a live game becomes a snapshot with every field the map uses", () => {
  const resultado = leerEstado(respuestaReal, grafoMini);
  assert.equal(resultado.tipo, "partida");
  if (resultado.tipo !== "partida") return;
  const { snapshot } = resultado;
  assert.equal(snapshot.turno, 12);
  assert.equal(snapshot.ronda, 2);
  assert.deepEqual(snapshot.zombies, respuestaReal.zombies);
  assert.deepEqual(snapshot.aristasBloqueadas, ["C-0004"]);
  assert.deepEqual(snapshot.sobrevivientes[0], respuestaReal.sobrevivientes[0]);
  assert.deepEqual(snapshot.metricas, respuestaReal.metricas);
  assert.equal(snapshot.generadoEn, respuestaReal.generadoEn);
});

test("without a refugios field, occupancy is counted from survivors that reached each shelter", () => {
  const resultado = leerEstado(respuestaReal, grafoMini);
  if (resultado.tipo !== "partida") return assert.fail("expected a game");
  assert.deepEqual(resultado.snapshot.refugios, [
    { id: norte.id, ocupacion: 2, capacidad: norte.capacidad },
    { id: sur.id, ocupacion: 0, capacidad: sur.capacidad },
  ]);
});

test("a refugios field sent by the API is used as is", () => {
  const refugios = [{ id: norte.id, ocupacion: 7, capacidad: 40 }];
  const resultado = leerEstado({ ...respuestaReal, refugios }, grafoMini);
  if (resultado.tipo !== "partida") return assert.fail("expected a game");
  assert.deepEqual(resultado.snapshot.refugios, refugios);
});

test("the no-game body of /estado is reported with its code, not as a game", () => {
  const resultado = leerEstado({ ok: false, error: { code: "SIN_PARTIDA_ACTIVA", message: "No active game" } }, grafoMini);
  assert.deepEqual(resultado, { tipo: "sinPartida", codigo: "SIN_PARTIDA_ACTIVA" });
});

test("a body that breaks the contract is rejected instead of drawing half a world", () => {
  assert.deepEqual(leerEstado({ turno: "doce" }, grafoMini), { tipo: "invalido" });
  assert.deepEqual(leerEstado(null, grafoMini), { tipo: "invalido" });
  assert.deepEqual(leerEstado({ ...respuestaReal, ronda: 4 }, grafoMini), { tipo: "invalido" });
});

test("unknown fields from the API are dropped", () => {
  const resultado = leerEstado({ ...respuestaReal, interno: "x" }, grafoMini);
  if (resultado.tipo !== "partida") return assert.fail("expected a game");
  assert.equal("interno" in resultado.snapshot, false);
});
