/**
 * Tests del ciclo de turnos de S1.
 *
 * Todos los tests corren con el reloj y la persistencia en memoria:
 * sin timers reales, sin DynamoDB y sin llamadas HTTP.
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
// Helpers: fixture de grafo mínimo (12 nodos, línea recta + un callejón sin salida)
//
// Disposición (bidireccional):
//   R-01 (refugio)
//    N-0001 — N-0002 — N-0003 — N-0004
//                              |
//                            N-0005  (sin salida)
// ---------------------------------------------------------------------------

// Unos pocos tests usan el grafo real de manta.json para asegurar que el
// ciclo funciona a escala, pero la mayoría usa un fixture chico.

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
// Test 1: secuencia del turno, orden de escritura
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
// Test 2: el motor puede leer el turno incompleto ANTES de completarTurno
// ---------------------------------------------------------------------------
test("incomplete turn is written to persistence before the motor is called", async () => {
  let turnoVistoAntesDePaso: { completo: boolean } | undefined;
  const cfg = configBase();

  cfg.motor = {
    async pedirPaso(pedido) {
      // Lee la persistencia dentro de la llamada al motor: el registro
      // incompleto ya debería estar escrito.
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
// Test 3: una respuesta inválida del motor equivale a quedarse quieto
// ---------------------------------------------------------------------------
test("invalid move from motor results in the survivor staying put", async () => {
  const cfg = configBase();
  cfg.motor = {
    // Devuelve un nodo que no es vecino de N-0001.
    async pedirPaso() { return { siguienteNodo: "N-0005" }; },
  };

  await ejecutarTurno(cfg, 1);

  assert.equal(cfg.sobrevivientes[0].nodo, "N-0001", "survivor must not move on invalid response");

  const turno = await cfg.persistencia.leerUltimoTurnoCompleto();
  assert.ok(turno);
  assert.equal(turno.sobrevivientes[0].siguienteNodo, "N-0001");
});

// ---------------------------------------------------------------------------
// Test 4: respaldo por timeout, el motor tarda demasiado → se queda quieto
// ---------------------------------------------------------------------------
test("motor timeout causes survivor to stay put", async () => {
  const cfg = configBase();
  cfg.motor = {
    // Nunca resuelve dentro de los 500 ms (la idea es una demora de 600 ms).
    // Con el reloj falso no hay demora real, pero la Promise compite contra
    // el AbortTimer de 500 ms; se simula simplemente no resolviendo nunca.
    pedirPaso() {
      return new Promise<never>(() => { /* a propósito, nunca resuelve */ });
    },
  };

  // El test tiene que resolver. ejecutarTurno aplica internamente un límite
  // de 500 ms con Promise.race. Acá hace falta un timeout real, porque el reloj
  // falso no afecta el límite basado en setTimeout.
  // El test en sí tiene un presupuesto generoso de 2 segundos de reloj.
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
// Test 5: varios sobrevivientes se consultan en paralelo dentro del mismo turno
// ---------------------------------------------------------------------------
test("all active survivors are queried and their moves are applied", async () => {
  const cfg = configBase();
  // Agrega un segundo sobreviviente en N-0002.
  cfg.sobrevivientes.push({ id: "S-0002", nodo: "N-0002", estado: "en_ruta" });
  const queried = new Set<string>();
  cfg.motor = {
    async pedirPaso({ sobrevivienteId, nodoActual }) {
      queried.add(sobrevivienteId);
      // Avanza hacia el vecino de la derecha.
      const neighbors = cfg.grafo.vecinos(nodoActual);
      const siguiente = neighbors.find((n) => n > nodoActual) ?? nodoActual;
      return { siguienteNodo: siguiente };
    },
  };

  await ejecutarTurno(cfg, 1);

  assert.ok(queried.has("S-0001"), "S-0001 must be queried");
  assert.ok(queried.has("S-0002"), "S-0002 must be queried");
  // Los dos sobrevivientes deberían haberse movido.
  assert.notEqual(cfg.sobrevivientes[0].nodo, "N-0001");
  assert.notEqual(cfg.sobrevivientes[1].nodo, "N-0002");
});

// ---------------------------------------------------------------------------
// Test 6: se omiten los sobrevivientes ya a salvo y los mordidos
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
// Test 7: ronda completa, los sobrevivientes llegan al refugio
// ---------------------------------------------------------------------------
test("correrRonda runs multiple turns and marks survivors a_salvo on arrival", async () => {
  const grafo = grafoMini();
  const zombies: ZombieInterno[] = [];
  const sobrevivientes: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0001", estado: "en_ruta" },
  ];

  // Camino al refugio: N-0001 → N-0002 → N-0003 → N-0004 (3 saltos).
  // N-0003 también conecta con N-0005 (sin salida), así que hay que elegir explícitamente.
  const ruta: Record<string, string> = {
    "N-0001": "N-0002",
    "N-0002": "N-0003",
    "N-0003": "N-0004",
    "N-0004": "N-0004",   // ya está en el refugio
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

  // El sobreviviente debería llegar a N-0004 en 3 turnos y la ronda debería terminar antes.
  assert.ok(resultados.length <= 5, "round should finish early once all survivors are safe");
  const ultimo = resultados.at(-1)!;
  assert.equal(ultimo.aSalvo, 1);
  assert.equal(ultimo.enRuta, 0);
});

// ---------------------------------------------------------------------------
// Test 8: calle bloqueada, el sobreviviente no puede usarla
// ---------------------------------------------------------------------------
test("blocked street prevents movement through that edge", async () => {
  const grafo = grafoMini();
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }];
  const cfg: ConfigTurno = {
    grafo,
    zombies: [],
    sobrevivientes: ss,
    aristasBloqueadas: ["C-0001"],   // bloquea N-0001 ↔ N-0002
    motor: {
      // Intenta moverse a N-0002: debe rechazarse porque C-0001 está bloqueada.
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
// Test 9: las métricas del turno son exactas
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
// Test 10: el turno completado se guarda con completo = true
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

// ---------------------------------------------------------------------------
// siguienteNodo publicado: el próximo paso planificado, no el que se acaba de dar
// ---------------------------------------------------------------------------

test("with a planner, a completed turn publishes each survivor's next step from its new position", async () => {
  const config = configBase();
  // El motor falso mueve a S-0001 de N-0001 a N-0002; desde ahí el siguiente paso es N-0003.
  config.planificarSiguiente = (s) => (s.nodo === "N-0002" ? "N-0003" : s.nodo);
  await ejecutarTurno(config, 1);
  const publicado = (await config.persistencia.leerUltimoTurnoCompleto())!.sobrevivientes[0]!;
  assert.equal(publicado.nodo, "N-0002", "the move itself is unchanged");
  assert.equal(publicado.siguienteNodo, "N-0003");
});

test("without a planner the published step stays the one just taken (HTTP rounds unchanged)", async () => {
  const config = configBase();
  await ejecutarTurno(config, 1);
  const publicado = (await config.persistencia.leerUltimoTurnoCompleto())!.sobrevivientes[0]!;
  assert.equal(publicado.nodo, "N-0002");
  assert.equal(publicado.siguienteNodo, "N-0002");
});

test("bitten and safe survivors are never planned", async () => {
  const config = configBase();
  config.sobrevivientes.push({ id: "S-0002", nodo: "N-0005", estado: "mordido" }, { id: "S-0003", nodo: "N-0004", estado: "a_salvo" });
  const planificados: string[] = [];
  config.planificarSiguiente = (s) => {
    planificados.push(s.id);
    return s.nodo;
  };
  await ejecutarTurno(config, 1);
  assert.deepEqual(planificados, ["S-0001"]);
});
