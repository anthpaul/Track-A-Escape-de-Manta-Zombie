import { test } from "node:test";
import assert from "node:assert/strict";
import { GRACIA_MS, resolverConexion } from "@/features/mapa/data/real/conexion";
import type { Snapshot } from "@/features/mapa/domain/tipos";

const snapshot = (turno: number): Snapshot => ({
  turno,
  ronda: 1,
  zombies: [],
  aristasBloqueadas: [],
  sobrevivientes: [],
  refugios: [],
  metricas: { vivos: 0, aSalvo: 0, mordidos: 0, p95ms: null },
  generadoEn: "2026-10-27T12:00:00.000Z",
});

test("before the first answer there is nothing real to show yet", () => {
  assert.deepEqual(resolverConexion({ resultado: "pendiente", ultimoReal: null, ahora: 0 }), {
    snapshot: null,
    conexion: "conectando",
    ultimoReal: null,
  });
});

test("a live game is shown and remembered with the time it arrived", () => {
  const s = snapshot(5);
  const r = resolverConexion({ resultado: { tipo: "partida", snapshot: s }, ultimoReal: null, ahora: 1000 });
  assert.equal(r.snapshot, s);
  assert.equal(r.conexion, "en_vivo");
  assert.deepEqual(r.ultimoReal, { snapshot: s, recibidoEn: 1000 });
});

test("the same answer at the same time keeps the remembered object, so React state settles", () => {
  const s = snapshot(5);
  const ultimoReal = { snapshot: s, recibidoEn: 1000 };
  const r = resolverConexion({ resultado: { tipo: "partida", snapshot: s }, ultimoReal, ahora: 1000 });
  assert.equal(r.ultimoReal, ultimoReal);
});

test("a failed poll right after a live game keeps the last real world instead of jumping to the simulation", () => {
  const ultimoReal = { snapshot: snapshot(5), recibidoEn: 1000 };
  for (const resultado of ["error", { tipo: "sinPartida", codigo: "SIN_PARTIDA_ACTIVA" }, { tipo: "invalido" }] as const) {
    const r = resolverConexion({ resultado, ultimoReal, ahora: 1000 + GRACIA_MS - 1 });
    assert.equal(r.snapshot, ultimoReal.snapshot);
    assert.equal(r.conexion, "reconectando");
    assert.equal(r.ultimoReal, ultimoReal);
  }
});

test("between rounds the last real turn stays on screen instead of the simulation", () => {
  const ultimoReal = { snapshot: snapshot(5), recibidoEn: 1000 };
  const ahora = 1000 + GRACIA_MS;
  assert.deepEqual(resolverConexion({ resultado: { tipo: "sinPartida", codigo: "SIN_PARTIDA_ACTIVA" }, ultimoReal, ahora }), {
    snapshot: ultimoReal.snapshot,
    conexion: "sin_partida",
    ultimoReal,
  });
});

test("after the grace period a broken connection falls back to the simulation and says why", () => {
  const ultimoReal = { snapshot: snapshot(5), recibidoEn: 1000 };
  const ahora = 1000 + GRACIA_MS;
  assert.deepEqual(resolverConexion({ resultado: "error", ultimoReal, ahora }), { snapshot: null, conexion: "sin_conexion", ultimoReal });
  assert.equal(resolverConexion({ resultado: { tipo: "invalido" }, ultimoReal, ahora }).conexion, "sin_conexion");
});

test("without any real game seen, no game and failures fall back at once", () => {
  assert.equal(resolverConexion({ resultado: { tipo: "sinPartida", codigo: "X" }, ultimoReal: null, ahora: 0 }).conexion, "sin_partida");
  assert.equal(resolverConexion({ resultado: "error", ultimoReal: null, ahora: 0 }).snapshot, null);
});
