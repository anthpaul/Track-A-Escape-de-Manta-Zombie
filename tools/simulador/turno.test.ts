/**
 * Tests for the S1 turn loop.
 *
 * All tests run against the in-memory clock and in-memory persistence —
 * no real timers, no DynamoDB, no HTTP calls.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { crearGrafo } from "@abcstack/shared";
import type { ZombieInterno } from "@abcstack/shared";
import type { Sobreviviente } from "@abcstack/shared";
import { crearMotorFalso } from "./motor-falso";
import { crearPersistenciaMemoria } from "./persistencia";
import { crearRelojFake } from "./reloj";
import { ejecutarTurno, correrRonda } from "./turno";
import type { ConfigTurno, ConfigRonda } from "./turno";

// ---------------------------------------------------------------------------
// Helpers: minimal graph fixture (12 nodes, straight line + one dead end)
//
// Layout (bidirectional):
//   R-01 (refugio)
//    N-0001 — N-0002 — N-0003 — N-0004
//                              |
//                            N-0005  (dead end)
// ---------------------------------------------------------------------------

// We use the real manta.json graph for a handful of tests to make sure
// the loop works at scale, but most tests use a small fixture.

const FIXTURE_MINI = {
  version: "test-1",
  nodos: [
    { id: "N-0001", lat: -0.9500, lng: -80.7200 },
    { id: "N-0002", lat: -0.9501, lng: -80.7201 },
    { id: "N-0003", lat: -0.9502, lng: -80.7202 },
    { id: "N-0004", lat: -0.9503, lng: -80.7203 },
    { id: "N-0005", lat: -0.9504, lng: -80.7202 },
  ],
  calles: [
    {
      id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 100, tipo: "calle",
      geometria: [[-80.7200, -0.9500], [-80.7201, -0.9501]],
    },
    {
      id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 100, tipo: "calle",
      geometria: [[-80.7201, -0.9501], [-80.7202, -0.9502]],
    },
    {
      id: "C-0003", desde: "N-0003", hasta: "N-0004", distancia_m: 100, tipo: "calle",
      geometria: [[-80.7202, -0.9502], [-80.7203, -0.9503]],
    },
    {
      id: "C-0004", desde: "N-0003", hasta: "N-0005", distancia_m: 80, tipo: "callejon",
      geometria: [[-80.7202, -0.9502], [-80.7202, -0.9504]],
    },
  ],
  refugios: [
    { id: "R-01", nodo: "N-0004", nombre: "Refugio Central", capacidad: 200 },
  ],
};

function grafoMini() {
  return crearGrafo(FIXTURE_MINI);
}

function configBase(): ConfigTurno {
  const grafo = grafoMini();
  const zs: ZombieInterno[] = [];
  const ss: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta" },
  ];
  return {
    grafo,
    zombies: zs,
    sobrevivientes: ss,
    aristasBloqueadas: [],
    motor: crearMotorFalso(grafo, () => zs),
    persistencia: crearPersistenciaMemoria(),
    reloj: crearRelojFake(),
    partidaId: "test-r1-0",
    ronda: 1,
    nodosRefugio: new Set(["N-0004"]),
    aleatorio: () => 0,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Turn sequence — write order
// ---------------------------------------------------------------------------
test("guardarTurnoIncompleto is called before completarTurno", async () => {
  const writes: string[] = [];
  const cfg = configBase();

  const basePersistencia = cfg.persistencia;
  cfg.persistencia = {
    async guardarTurnoIncompleto(p) {
      writes.push(`incompleto:${p.turno}`);
      return basePersistencia.guardarTurnoIncompleto(p);
    },
    async completarTurno(turno, decisiones) {
      writes.push(`completo:${turno}`);
      return basePersistencia.completarTurno(turno, decisiones);
    },
    leerTurno: basePersistencia.leerTurno.bind(basePersistencia),
    leerUltimoTurnoCompleto: basePersistencia.leerUltimoTurnoCompleto.bind(basePersistencia),
  };

  await ejecutarTurno(cfg, 1);

  assert.deepEqual(writes, ["incompleto:1", "completo:1"]);
});

// ---------------------------------------------------------------------------
// Test 2: Incomplete turn is readable by the motor BEFORE completarTurno
// ---------------------------------------------------------------------------
test("incomplete turn is written to persistence before the motor is called", async () => {
  let turnoVistoAntesDePaso: { completo: boolean } | undefined;
  const cfg = configBase();

  cfg.motor = {
    async pedirPaso(pedido) {
      // Read persistence inside the motor call — should already have the
      // incomplete record written.
      const registro = await cfg.persistencia.leerTurno(pedido.turno);
      if (registro) turnoVistoAntesDePaso = registro as unknown as { completo: boolean };
      return { siguienteNodo: pedido.nodoActual };
    },
  };

  await ejecutarTurno(cfg, 1);

  assert.ok(turnoVistoAntesDePaso !== undefined, "incomplete turn must exist when motor is called");
  assert.equal(turnoVistoAntesDePaso.completo, false);
});

// ---------------------------------------------------------------------------
// Test 3: Invalid motor response falls back to staying put
// ---------------------------------------------------------------------------
test("invalid move from motor results in the survivor staying put", async () => {
  const cfg = configBase();
  cfg.motor = {
    // Return a node that is not a neighbor of N-0001.
    async pedirPaso() { return { siguienteNodo: "N-0005" }; },
  };

  await ejecutarTurno(cfg, 1);

  assert.equal(cfg.sobrevivientes[0].nodo, "N-0001", "survivor must not move on invalid response");

  const turno = await cfg.persistencia.leerUltimoTurnoCompleto();
  assert.ok(turno);
  assert.equal(turno.sobrevivientes[0].siguienteNodo, "N-0001");
});

// ---------------------------------------------------------------------------
// Test 4: Timeout fallback — motor takes too long → stay put
// ---------------------------------------------------------------------------
test("motor timeout causes survivor to stay put", async () => {
  const cfg = configBase();
  cfg.motor = {
    // Never resolves within 500 ms — we use a 600 ms delay.
    // With the fake clock, no real delay occurs, but the Promise itself
    // races against our 500 ms AbortTimer; we simulate by just never resolving.
    pedirPaso() {
      return new Promise<never>(() => { /* intentionally never resolves */ });
    },
  };

  // The test must resolve. ejecutarTurno enforces a 500 ms deadline via
  // Promise.race internally.  We need a real timeout here because the fake
  // clock does not affect setTimeout-based deadline enforcement.
  // We give a generous 2-second wall-clock budget for the test itself.
  await Promise.race([
    ejecutarTurno(cfg, 1),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("test timed out")), 2_000),
    ),
  ]);

  assert.equal(cfg.sobrevivientes[0].nodo, "N-0001");
  const resultado = await cfg.persistencia.leerUltimoTurnoCompleto();
  assert.ok(resultado);
  assert.equal(resultado.sobrevivientes[0].siguienteNodo, "N-0001");
});

// ---------------------------------------------------------------------------
// Test 5: Multiple survivors are queried concurrently within the same turn
// ---------------------------------------------------------------------------
test("all active survivors are queried and their moves are applied", async () => {
  const cfg = configBase();
  // Add a second survivor at N-0002.
  cfg.sobrevivientes.push({ id: "S-0002", nodo: "N-0002", estado: "en_ruta" });
  const queried = new Set<string>();
  cfg.motor = {
    async pedirPaso({ sobrevivienteId, nodoActual }) {
      queried.add(sobrevivienteId);
      // Move toward the right neighbor.
      const neighbors = cfg.grafo.vecinos(nodoActual);
      const siguiente = neighbors.find((n) => n > nodoActual) ?? nodoActual;
      return { siguienteNodo: siguiente };
    },
  };

  await ejecutarTurno(cfg, 1);

  assert.ok(queried.has("S-0001"), "S-0001 must be queried");
  assert.ok(queried.has("S-0002"), "S-0002 must be queried");
  // Both survivors should have moved.
  assert.notEqual(cfg.sobrevivientes[0].nodo, "N-0001");
  assert.notEqual(cfg.sobrevivientes[1].nodo, "N-0002");
});

// ---------------------------------------------------------------------------
// Test 6: Already-safe and dead survivors are skipped
// ---------------------------------------------------------------------------
test("a_salvo and mordido survivors are not queried", async () => {
  const cfg = configBase();
  cfg.sobrevivientes.push(
    { id: "S-0002", nodo: "N-0002", estado: "a_salvo" },
    { id: "S-0003", nodo: "N-0003", estado: "mordido" },
  );
  const queried = new Set<string>();
  cfg.motor = {
    async pedirPaso({ sobrevivienteId }) {
      queried.add(sobrevivienteId);
      return { siguienteNodo: cfg.sobrevivientes[0].nodo };
    },
  };

  await ejecutarTurno(cfg, 1);

  assert.ok(!queried.has("S-0002"), "safe survivor must not be queried");
  assert.ok(!queried.has("S-0003"), "dead survivor must not be queried");
});

// ---------------------------------------------------------------------------
// Test 7: Complete round — survivors arrive at the refuge
// ---------------------------------------------------------------------------
test("correrRonda runs multiple turns and marks survivors a_salvo on arrival", async () => {
  const grafo = grafoMini();
  const zombies: ZombieInterno[] = [];
  const sobrevivientes: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta" },
  ];

  // Path to the refuge: N-0001 → N-0002 → N-0003 → N-0004 (3 hops).
  // N-0003 also connects to N-0005 (dead end), so we must pick explicitly.
  const ruta: Record<string, string> = {
    "N-0001": "N-0002",
    "N-0002": "N-0003",
    "N-0003": "N-0004",
    "N-0004": "N-0004",   // already at refuge
  };

  const cfg: ConfigRonda = {
    grafo,
    zombies,
    sobrevivientes,
    aristasBloqueadas: [],
    motor: {
      async pedirPaso({ nodoActual }) {
        return { siguienteNodo: ruta[nodoActual] ?? nodoActual };
      },
    },
    persistencia: crearPersistenciaMemoria(),
    reloj: crearRelojFake(),
    partidaId: "test-r1-round",
    ronda: 1,
    nodosRefugio: new Set(["N-0004"]),
    aleatorio: () => 0,
    totalTurnos: 10,
  };

  const resultados = await correrRonda(cfg);

  // The survivor should reach N-0004 in 3 turns and the round should stop early.
  assert.ok(resultados.length <= 5, "round should finish early once all survivors are safe");
  const ultimo = resultados.at(-1)!;
  assert.equal(ultimo.aSalvo, 1);
  assert.equal(ultimo.enRuta, 0);
});

// ---------------------------------------------------------------------------
// Test 8: Blocked street — survivor cannot use it
// ---------------------------------------------------------------------------
test("blocked street prevents movement through that edge", async () => {
  const grafo = grafoMini();
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }];
  const cfg: ConfigTurno = {
    grafo,
    zombies: [],
    sobrevivientes: ss,
    aristasBloqueadas: ["C-0001"],   // block N-0001 ↔ N-0002
    motor: {
      // Tries to move to N-0002 — should be rejected because C-0001 is blocked.
      async pedirPaso() { return { siguienteNodo: "N-0002" }; },
    },
    persistencia: crearPersistenciaMemoria(),
    reloj: crearRelojFake(),
    partidaId: "test-r1-blocked",
    ronda: 1,
    nodosRefugio: new Set(["N-0004"]),
    aleatorio: () => 0,
  };

  await ejecutarTurno(cfg, 1);

  assert.equal(cfg.sobrevivientes[0].nodo, "N-0001", "survivor must not cross a blocked street");
});

// ---------------------------------------------------------------------------
// Test 9: Turn metrics are accurate
// ---------------------------------------------------------------------------
test("ResultadoTurno counts are correct", async () => {
  const grafo = grafoMini();
  const ss: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta" },
    { id: "S-0002", nodo: "N-0002", estado: "a_salvo" },
    { id: "S-0003", nodo: "N-0003", estado: "mordido" },
  ];
  const cfg: ConfigTurno = {
    grafo,
    zombies: [],
    sobrevivientes: ss,
    aristasBloqueadas: [],
    motor: crearMotorFalso(grafo, () => []),
    persistencia: crearPersistenciaMemoria(),
    reloj: crearRelojFake(),
    partidaId: "test-metrics",
    ronda: 1,
    nodosRefugio: new Set(["N-0004"]),
    aleatorio: () => 0,
  };

  const resultado = await ejecutarTurno(cfg, 1);

  assert.equal(resultado.enRuta, 1);
  assert.equal(resultado.aSalvo, 1);
  assert.equal(resultado.mordidos, 1);
  assert.equal(resultado.respuestasValidas + resultado.respuestasFallidas, 1,
    "only 1 active survivor queried");
});

// ---------------------------------------------------------------------------
// Test 10: Completed turn is stored with completo = true
// ---------------------------------------------------------------------------
test("leerUltimoTurnoCompleto returns the completed turn snapshot", async () => {
  const cfg = configBase();
  await ejecutarTurno(cfg, 1);

  const completo = await cfg.persistencia.leerUltimoTurnoCompleto();
  assert.ok(completo, "must have a completed turn");
  assert.equal(completo.completo, true);
  assert.equal(completo.turno, 1);
  assert.ok(Array.isArray(completo.sobrevivientes));
});
