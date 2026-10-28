import assert from "node:assert/strict";
import { test } from "node:test";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { crearRelojFake } from "./reloj";
import { ejecutarTurno } from "./turno";
import { MotorHttp } from "./motor-http";
import { correrRonda } from "./turno";
import { parseArgs } from "./correr";
import { calcularMetricas } from "./metricas";

test("rounds have reproducible placements, distinct identities and prescribed composition", () => {
  for (const [crear, total] of [[crearEscenarioR1, 20], [crearEscenarioR2, 80], [crearEscenarioR3, 200]] as const) {
    const a = crear({ semilla: 42 });
    const b = crear({ semilla: 42 });
    assert.equal(a.config.sobrevivientes.length, total);
    assert.equal(a.config.totalTurnos, 150);
    assert.deepEqual(a.config.sobrevivientes, b.config.sobrevivientes);
    assert.deepEqual(a.config.zombies, b.config.zombies);
    assert.notEqual(a.config.partidaId, b.config.partidaId);
  }
  assert.deepEqual(new Set(crearEscenarioR1({ semilla: 42 }).config.zombies.map(z => z.tipo)), new Set(["caminante"]));
  assert.equal(crearEscenarioR2({ semilla: 42 }).config.eventos?.length, 1);
  assert.equal(crearEscenarioR3({ semilla: 42 }).config.eventos?.length, 2);
  assert.throws(() => crearEscenarioR1({ semilla: -1 }));
});

test("completed snapshots contain final survivor positions and states", async () => {
  const { config } = crearEscenarioR1({ semilla: 42, reloj: crearRelojFake() });
  config.zombies.length = 0;
  const refuge = [...config.nodosRefugio][0]!;
  const source = config.grafo.vecinos(refuge)[0]!;
  config.sobrevivientes = [{ id: "S-0001", nodo: source, estado: "en_ruta" }];
  config.motor = { async pedirPaso() { return { siguienteNodo: refuge }; } };
  await ejecutarTurno(config, 1);
  const snapshot = await config.persistencia.leerUltimoTurnoCompleto();
  assert.deepEqual(snapshot?.sobrevivientes, config.sobrevivientes);
  assert.equal(snapshot?.sobrevivientes[0]?.estado, "a_salvo");
});

test("200 timed-out requests share a single deadline window and are aborted", async () => {
  const { config } = crearEscenarioR3({ semilla: 1, reloj: crearRelojFake() });
  config.zombies.length = 0;
  let aborted = 0;
  config.motor = { pedirPaso(_pedido, signal?: AbortSignal) {
    signal?.addEventListener("abort", () => aborted++);
    return new Promise(() => {});
  } };
  const inicio = performance.now();
  const result = await ejecutarTurno(config, 1);
  assert.ok(performance.now() - inicio < 1500, "one deadline window, not ten sequential batches");
  assert.equal(result.respuestasFallidas, 200);
  assert.equal(aborted, 200);
});

test("HTTP failures record exactly one complete request latency", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("bad", { status: 503 });
  try {
    const motor = new MotorHttp({ url: "http://localhost/api/paso", apiKey: "test" });
    await assert.rejects(motor.pedirPaso({ sobrevivienteId: "S-0001", nodoActual: "N-0001", turno: 1 }));
    assert.equal(motor.latencias.length, 1);
    motor.resetLatencias();
    globalThis.fetch = async () => new Response(JSON.stringify({ siguienteNodo: "N-0002" }));
    assert.deepEqual(await motor.pedirPaso({ sobrevivienteId: "S-0001", nodoActual: "N-0001", turno: 1 }), { siguienteNodo: "N-0002" });
    assert.equal(motor.latencias.length, 1);
  } finally { globalThis.fetch = original; }
});

test("CLI preserves defaults and rejects invalid or ignored options", () => {
  assert.deepEqual(parseArgs([]), { ronda: 1, semilla: 42, modo: "local" });
  assert.deepEqual(parseArgs(["--ronda=3", "--semilla=0", "--modo=http"]), { ronda: 3, semilla: 0, modo: "http" });
  for (const args of [["--ronda=4"], ["--semilla=-1"], ["--modo=other"], ["--unknown=1"], ["--ronda=1", "--ronda=2"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("all three rounds execute reproducibly and publish their scheduled real street events", async () => {
  for (const crear of [crearEscenarioR1, crearEscenarioR2, crearEscenarioR3]) {
    const a = crear({ semilla: 42, reloj: crearRelojFake() });
    const b = crear({ semilla: 42, reloj: crearRelojFake() });
    const resultA = await correrRonda(a.config);
    const resultB = await correrRonda(b.config);
    assert.deepEqual(resultA, resultB);
    assert.deepEqual(a.config.sobrevivientes, b.config.sobrevivientes);
    const last = resultA.at(-1)!;
    assert.equal(last.turno, 150);
    for (const event of a.config.eventos ?? []) {
      if (event.turno <= last.turno) assert.ok(a.config.aristasBloqueadas.includes(event.calleId));
    }
    const snapshot = await a.config.persistencia.leerUltimoTurnoCompleto();
    assert.deepEqual(snapshot?.sobrevivientes, a.config.sobrevivientes);
    assert.ok(snapshot?.zombies.every(z => z.tipo !== ("dormido" as string)));
  }
});

test("metrics distinguish living from rescued, nearest-rank latency and unavailable local latency", () => {
  const e = crearEscenarioR1({ semilla: 42 });
  const node = [...e.nodosRefugio][0]!;
  const source = e.config.grafo.vecinos(node)[0]!;
  const inputs = {
    ronda: 1 as const,
    resultadosTurnos: [{ turno: 1, respuestasValidas: 3, respuestasFallidas: 1, enRuta: 1, aSalvo: 1, mordidos: 1, duracionMs: 2000 }],
    latencias: [1, 2, 3, 100],
    sobrevivientes: [{ id: "S-0001", nodo: node, estado: "a_salvo" as const }, { id: "S-0002", nodo: source, estado: "en_ruta" as const }, { id: "S-0003", nodo: source, estado: "mordido" as const }],
    datosIniciales: ["S-0001", "S-0002", "S-0003"].map((id, i) => ({ id, nodoInicial: source, estado: "en_ruta" as const, turnoLlegada: i === 0 ? 2 : 0 })),
    grafo: e.config.grafo, nodosRefugio: e.nodosRefugio,
  };
  const m = calcularMetricas(inputs);
  assert.equal(m.supervivencia, 2 / 3);
  assert.equal(m.rescatados, 1 / 3);
  assert.equal(m.eficienciaPromedio, 2);
  assert.equal(m.latenciaP50Ms, 2);
  assert.equal(m.latenciaP95Ms, 100);
  assert.equal(m.latenciaP99Ms, 100);
  assert.equal(m.tasaError, 1 / 4);
  assert.equal(calcularMetricas({ ...inputs, latencias: [] }).latenciaP95Ms, null);
});

test("demo rounds stop once nobody is on the road; evaluation rounds always play 150 turns", () => {
  for (const crear of [crearEscenarioR1, crearEscenarioR2, crearEscenarioR3]) {
    assert.equal(crear({ semilla: 1 }).config.detenerSinActivos, false);
    assert.equal(crear({ semilla: 1, modo: "evaluacion" }).config.detenerSinActivos, false);
    assert.equal(crear({ semilla: 1, modo: "demo" }).config.detenerSinActivos, true);
  }
});
