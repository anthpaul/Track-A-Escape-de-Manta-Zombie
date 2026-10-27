import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./data/fixture-mini.json";
import manta from "./data/manta.json";
import {
  CalleSchema, EstadoTurnoSchema, GrafoSchema, NodoSchema, RefugioSchema,
  SobrevivienteSchema, ZombieSchema,
} from "./index";

test("accepts the agreed mini fixture and the real Manta graph without mutation", () => {
  for (const input of [fixture, manta]) {
    const before = structuredClone(input);
    assert.deepEqual(GrafoSchema.parse(input), before);
    assert.deepEqual(input, before);
  }
  assert.equal(fixture.nodos.length, 12);
  assert.equal(fixture.calles.length, 15);
  assert.equal(fixture.calles.filter((calle) => calle.tipo === "puente").length, 1);
  assert.equal(fixture.refugios.length, 2);
});

test("validates IDs, geographic coordinates, street types, distance and capacity", () => {
  const node = fixture.nodos[0];
  for (const patch of [
    { id: "1" }, { lat: NaN }, { lng: Infinity }, { lat: -91 }, { lat: 91 },
    { lng: -181 }, { lng: 181 }, { barrio: "unknown" },
  ]) assert.equal(NodoSchema.safeParse({ ...node, ...patch }).success, false);
  const { barrio: _barrio, ...withoutBarrio } = node;
  assert.equal(NodoSchema.safeParse(withoutBarrio).success, true);
  for (const patch of [
    { id: "1" }, { desde: "1" }, { hasta: "2" }, { distancia_m: 0 },
    { distancia_m: -1 }, { distancia_m: Infinity }, { tipo: "highway" },
    { geometria: [] }, { geometria: [[-80.72, -0.95]] },
    { geometria: [[181, 0], [0, 0]] }, { geometria: [[0, 91], [0, 0]] },
  ]) assert.equal(CalleSchema.safeParse({ ...fixture.calles[0], ...patch }).success, false);
  for (const patch of [{ id: "R-1" }, { nodo: "1" }, { capacidad: -1 }, { capacidad: 1.5 }]) {
    assert.equal(RefugioSchema.safeParse({ ...fixture.refugios[0], ...patch }).success, false);
  }
  assert.equal(RefugioSchema.parse({ ...fixture.refugios[0], capacidad: 0 }).capacidad, 0);
});

test("rejects duplicate IDs within each graph collection", () => {
  for (const collection of ["nodos", "calles", "refugios"] as const) {
    const input = structuredClone(fixture);
    input[collection][1].id = input[collection][0].id;
    assert.equal(GrafoSchema.safeParse(input).success, false, collection);
  }
});

test("rejects missing references, self loops and parallel streets in either direction", () => {
  for (const change of [
    (g: typeof fixture) => { g.calles[0].desde = "N-9999"; },
    (g: typeof fixture) => { g.calles[0].hasta = "N-9999"; },
    (g: typeof fixture) => { g.refugios[0].nodo = "N-9999"; },
    (g: typeof fixture) => { g.calles[0].hasta = g.calles[0].desde; },
    (g: typeof fixture) => { g.calles.push({ ...g.calles[0], id: "C-9999" }); },
    (g: typeof fixture) => {
      const street = g.calles[0];
      g.calles.push({ ...street, id: "C-9999", desde: street.hasta, hasta: street.desde,
        geometria: [...street.geometria].reverse() });
    },
  ]) {
    const input = structuredClone(fixture);
    change(input);
    assert.equal(GrafoSchema.safeParse(input).success, false);
  }
});

test("requires exact geometry endpoints in longitude/latitude order and street direction", () => {
  for (const geometry of [
    [], [[-80.72, -0.95]],
    [[-0.95, -80.72], [-0.95, -80.71]],
    [[-80.71, -0.95], [-80.72, -0.95]],
    [[-80.720001, -0.95], [-80.71, -0.95]],
    [[-80.72, -0.95], [-80.710001, -0.95]],
  ]) {
    const input = structuredClone(fixture);
    input.calles[0].geometria = geometry;
    assert.equal(GrafoSchema.safeParse(input).success, false);
  }
  const input = structuredClone(fixture);
  input.calles[0].geometria.splice(1, 0, [-80.715, -0.949]);
  assert.equal(GrafoSchema.safeParse(input).success, true);
});

const turn = {
  partidaId: "test-r1", ronda: 1, turno: 1, completo: false,
  zombies: [{ id: "Z-0001", tipo: "caminante", nodo: "N-0002" }],
  aristasBloqueadas: ["C-0005"],
  sobrevivientes: [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }],
};

test("validates all zombie types but excludes sleepers from visible turn snapshots", () => {
  for (const tipo of ["caminante", "corredor", "horda", "dormido"]) {
    const zombie = { ...turn.zombies[0], tipo };
    assert.equal(ZombieSchema.safeParse(zombie).success, true);
    assert.equal(EstadoTurnoSchema.safeParse({ ...turn, zombies: [zombie] }).success, tipo !== "dormido");
  }
  for (const patch of [{ id: "" }, { tipo: "unknown" }, { nodo: "1" }]) {
    assert.equal(ZombieSchema.safeParse({ ...turn.zombies[0], ...patch }).success, false);
  }
});

test("accepts survivor lifecycle and optional next-step and destination fields", () => {
  for (const estado of ["en_ruta", "a_salvo", "mordido"]) {
    const survivor = { ...turn.sobrevivientes[0], estado, siguienteNodo: "N-0002",
      refugio: "R-01", callesRestantes: 3 };
    assert.deepEqual(SobrevivienteSchema.parse(survivor), survivor);
  }
  assert.equal(SobrevivienteSchema.safeParse({ ...turn.sobrevivientes[0], refugio: null }).success, true);
  for (const patch of [
    { id: "1" }, { nodo: "1" }, { estado: "active" }, { siguienteNodo: "2" },
    { callesRestantes: -1 }, { callesRestantes: 1.5 },
  ]) assert.equal(SobrevivienteSchema.safeParse({ ...turn.sobrevivientes[0], ...patch }).success, false);
});

test("validates complete/incomplete turns, rounds and blocked street IDs", () => {
  assert.deepEqual(EstadoTurnoSchema.parse(turn), turn);
  for (const ronda of [1, 2, 3]) {
    assert.equal(EstadoTurnoSchema.safeParse({ ...turn, ronda, completo: true }).success, true);
  }
  for (const patch of [
    { partidaId: "" }, { ronda: 0 }, { ronda: 4 }, { turno: -1 }, { turno: 1.5 },
    { completo: "true" }, { aristasBloqueadas: ["5"] },
  ]) assert.equal(EstadoTurnoSchema.safeParse({ ...turn, ...patch }).success, false);
});

test("a turn may carry the round's /paso p95 so far, optional and never negative", () => {
  assert.deepEqual(EstadoTurnoSchema.parse({ ...turn, p95ms: 87.5 }), { ...turn, p95ms: 87.5 });
  assert.equal(EstadoTurnoSchema.safeParse({ ...turn, p95ms: null }).success, true, "no latency measured yet");
  assert.equal("p95ms" in EstadoTurnoSchema.parse(turn), false, "turns written before stay valid");
  assert.equal(EstadoTurnoSchema.safeParse({ ...turn, p95ms: -1 }).success, false);
});
