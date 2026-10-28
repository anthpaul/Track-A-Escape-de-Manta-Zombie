import assert from "node:assert/strict";
import { test } from "node:test";
import { PutCommand, TransactWriteCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { crearGrafo } from "@abcstack/shared";
import grafoData from "../../shared/data/manta.json";
import { calcularSiguienteNodo } from "../../backend/src/motor/motor";
import { KEYS } from "../../backend/src/db/keys";
import { crearHandler, parseEvento } from "./lambda";
import { crearMotorEnProceso } from "./motor-en-proceso";
import { crearEscenarioR1 } from "./escenarios";
import { DynamoPersistencia } from "./dynamo-persistencia";
import { crearRelojFake } from "./reloj";

type Comando = PutCommand | TransactWriteCommand | DeleteCommand;
const grafo = crearGrafo(grafoData);

function clienteFalso(opciones: { candadoOcupado?: boolean } = {}) {
  const comandos: Comando[] = [];
  return {
    comandos,
    cliente: {
      async send(comando: Comando) {
        comandos.push(comando);
        if (opciones.candadoOcupado && comando instanceof PutCommand && comando.input.Item?.PK === KEYS.control().PK) {
          throw Object.assign(new Error("occupied"), { name: "ConditionalCheckFailedException" });
        }
        return {};
      },
    },
  };
}

test("demo scenarios get a demo game id; evaluation stays the default", () => {
  assert.match(crearEscenarioR1({ semilla: 1, modo: "demo" }).config.partidaId, /^demo-r1-\d+$/);
  assert.match(crearEscenarioR1({ semilla: 1 }).config.partidaId, /^evaluacion-r1-\d+$/);
});

test("a demo game is recorded as demo in the lock and in its metadata", async () => {
  const { cliente, comandos } = clienteFalso();
  const store = new DynamoPersistencia(cliente, "t", "demo-r2-123", 2, () => 1_000_000);
  await store.iniciar(7);
  assert.equal((comandos[0] as PutCommand).input.Item?.modo, "demo");
  const meta = (comandos[1] as TransactWriteCommand).input.TransactItems?.[1]?.Put?.Item as { data: { config: { modo: string } } };
  assert.equal(meta.data.config.modo, "demo");
});

test("the in-process motor answers exactly what /paso's motor answers, and never sees sleepers", async () => {
  const corredor = { id: "Z-0001", tipo: "corredor" as const, nodo: grafoData.nodos[5]!.id };
  const zombies = [corredor, { id: "Z-0002", tipo: "dormido" as const, nodo: grafoData.nodos[9]!.id }];
  const motor = crearMotorEnProceso(() => zombies, () => []);
  for (const nodo of grafoData.nodos.slice(0, 40)) {
    const esperado = calcularSiguienteNodo({
      sobrevivienteId: "S-0001",
      nodoActual: nodo.id,
      mundo: { partidaId: "x", turno: 1, zombies: [corredor], aristasBloqueadas: [] },
    }).siguienteNodo;
    assert.equal((await motor.pedirPaso({ sobrevivienteId: "S-0001", nodoActual: nodo.id, turno: 1 })).siguienteNodo, esperado);
  }
  assert.ok(grafo.vecinos(grafoData.nodos[0]!.id).length > 0);
});

test("a scheduled demo plays a whole round on DynamoDB and releases the lock", async () => {
  const { cliente, comandos } = clienteFalso();
  const handler = crearHandler({ cliente, tabla: "t", reloj: crearRelojFake() });
  const r = await handler({ ronda: 1, semilla: 3 });
  assert.equal(r.iniciada, true);
  assert.match(r.partidaId!, /^demo-r1-/);
  assert.equal(r.aSalvo! + r.mordidos! + r.enRuta!, 20);
  assert.ok(comandos[0] instanceof PutCommand, "first takes the lock");
  // Las rondas de demo se detienen cuando ya no queda nadie en ruta (las de evaluación siempre juegan 150 turnos).
  assert.equal(r.enRuta, 0, "the demo ends when nobody is left on the road");
  const publicaciones = comandos.filter((c) => c instanceof TransactWriteCommand).length;
  assert.ok(publicaciones >= 2 && publicaciones < 2 * 150, "every turn played is published twice, and it stopped early");
  assert.ok(comandos.at(-1) instanceof DeleteCommand, "the lock is released at the end");
});

test("demo turns publish each survivor's next planned step, so the map can draw its arrow", async () => {
  const { cliente, comandos } = clienteFalso();
  await crearHandler({ cliente, tabla: "t", reloj: crearRelojFake() })({ ronda: 1, semilla: 3 });
  type Publicado = { nodo: string; estado: string; siguienteNodo?: string };
  const publicados = comandos
    .filter((c): c is TransactWriteCommand => c instanceof TransactWriteCommand)
    .flatMap((c) => c.input.TransactItems ?? [])
    .filter((item) => item.Update?.UpdateExpression?.includes("#data.sobrevivientes"))
    .flatMap((item) => item.Update!.ExpressionAttributeValues![":survivors"] as Publicado[])
    .filter((s) => s.estado === "en_ruta");
  assert.ok(publicados.length > 0);
  assert.ok(publicados.some((s) => s.siguienteNodo !== s.nodo), "a moving survivor points somewhere else");
  for (const s of publicados) {
    assert.ok(grafo.esMovimientoValido(s.nodo, s.siguienteNodo!, []), `${s.nodo} → ${s.siguienteNodo} must be a street`);
  }
});

test("when another round holds the lock, the demo exits without writing anything else", async () => {
  const { cliente, comandos } = clienteFalso({ candadoOcupado: true });
  const r = await crearHandler({ cliente, tabla: "t", reloj: crearRelojFake() })({});
  assert.deepEqual(r, { iniciada: false });
  assert.equal(comandos.length, 1);
});

test("event defaults to R2 with a fresh seed and rejects invalid rounds", () => {
  const e = parseEvento({});
  assert.equal(e.ronda, 2);
  assert.ok(Number.isInteger(e.semilla));
  assert.deepEqual(parseEvento({ ronda: 3, semilla: 9 }), { ronda: 3, semilla: 9, modo: "demo", flota: true });
  assert.throws(() => parseEvento({ ronda: 4 }));
  assert.throws(() => parseEvento({ semilla: -1 }));
});

test("if the round breaks midway, the lock is still released and the error surfaces", async () => {
  const comandos: Comando[] = [];
  let escrituras = 0;
  const cliente = {
    async send(comando: Comando) {
      comandos.push(comando);
      if (comando instanceof TransactWriteCommand && ++escrituras === 4) throw new Error("dynamo down");
      return {};
    },
  };
  await assert.rejects(crearHandler({ cliente, tabla: "t", reloj: crearRelojFake() })({ ronda: 1, semilla: 1 }), /dynamo down/);
  assert.ok(comandos.at(-1) instanceof DeleteCommand, "the lock is released even after a failure");
});

test("the event picks evaluation mode explicitly; anything else is rejected", () => {
  assert.equal(parseEvento({ modo: "evaluacion", semilla: 1 }).modo, "evaluacion");
  assert.equal(parseEvento({ modo: "demo", semilla: 1 }).modo, "demo");
  assert.throws(() => parseEvento({ modo: "prueba" }), /modo/);
});

// Sustituto del motor HTTP: cada sobreviviente se queda donde está y cada llamada registra 1 ms.
function motorHttpFalso() {
  const motor = {
    latencias: [] as number[],
    llamadas: 0,
    async pedirPaso(pedido: { nodoActual: string }) {
      motor.llamadas++;
      motor.latencias.push(1);
      return { siguienteNodo: pedido.nodoActual };
    },
  };
  return motor;
}

test("an evaluation round warms up first, then plays all 150 turns over HTTP and reports its metrics", async () => {
  const { cliente, comandos } = clienteFalso();
  const motores: ReturnType<typeof motorHttpFalso>[] = [];
  const opciones: ({ timeoutMs?: number } | undefined)[] = [];
  const handler = crearHandler({
    cliente,
    tabla: "t",
    reloj: crearRelojFake(),
    crearMotorHttp: (o) => {
      opciones.push(o);
      const m = motorHttpFalso();
      motores.push(m);
      return m;
    },
    pausaCalentamientoMs: 0,
  });
  const r = await handler({ ronda: 1, semilla: 3, modo: "evaluacion" });
  assert.equal(r.iniciada, true);
  if (!r.iniciada) return;
  assert.match(r.partidaId, /^evaluacion-r1-/);
  assert.equal(r.modo, "evaluacion");

  // Warm-up: motor propio, 4 oleadas simultáneas tan grandes como la ronda (20 sobrevivientes en la R1).
  // Espera hasta 3 s por pedido para que las instancias nuevas terminen de arrancar; la ronda mantiene
  // el corte oficial de 500 ms. El motor de la ronda se construye primero (antes del lock) y el del
  // warm-up justo antes del turno 1.
  const [ronda, calentamiento] = motores;
  assert.equal(motores.length, 2, "warm-up and round use separate motors, so their latencies never mix");
  assert.deepEqual(r.calentamiento!.map((o) => [o.oleada, o.pedidos, o.errores]), [[1, 20, 0], [2, 20, 0], [3, 20, 0], [4, 20, 0]]);
  assert.equal(calentamiento.llamadas, 80);
  assert.deepEqual(opciones, [undefined, { timeoutMs: 3000 }]);

  // Las rondas de evaluación nunca terminan antes, y las métricas solo cuentan las llamadas de la propia ronda.
  assert.equal(r.metricas!.turnosEjecutados, 150);
  assert.equal(r.metricas!.totalLlamadas, ronda.llamadas);
  assert.equal(r.metricas!.latenciaP95Ms, 1);
  assert.equal(r.metricas!.errores, 0);
  assert.ok(comandos.filter((c) => c instanceof TransactWriteCommand).length >= 2 * 150, "every turn is published twice");
});

test("an evaluation round without PASO_URL / PASO_KEY fails before taking the lock", async () => {
  const { cliente, comandos } = clienteFalso();
  const antes = { url: process.env.PASO_URL, key: process.env.PASO_KEY };
  delete process.env.PASO_URL;
  delete process.env.PASO_KEY;
  try {
    await assert.rejects(crearHandler({ cliente, tabla: "t", reloj: crearRelojFake() })({ ronda: 1, semilla: 3, modo: "evaluacion" }), /PASO_URL/);
    assert.equal(comandos.length, 0, "nothing was written");
  } finally {
    if (antes.url !== undefined) process.env.PASO_URL = antes.url;
    if (antes.key !== undefined) process.env.PASO_KEY = antes.key;
  }
});

test("the in-process motor sees who is where, so demo rounds respect shelter capacity too", async () => {
  const uleam = grafoData.refugios.find((r) => r.nombre.includes("ULEAM"))!;
  const puerta = grafo.vecinos(uleam.nodo)[0]!;
  const dentro = Array.from({ length: uleam.capacidad }, (_, i) => ({ id: `S-${String(i + 100).padStart(4, "0")}`, nodo: uleam.nodo, estado: "a_salvo" as const }));
  const yo = { id: "S-0001", nodo: puerta, estado: "en_ruta" as const };
  const pedido = { sobrevivienteId: "S-0001", nodoActual: puerta, turno: 3 };
  const conLugar = crearMotorEnProceso(() => [], () => [], () => [yo]);
  const lleno = crearMotorEnProceso(() => [], () => [], () => [...dentro, yo]);
  assert.equal((await conLugar.pedirPaso(pedido)).siguienteNodo, uleam.nodo);
  assert.notEqual((await lleno.pedirPaso(pedido)).siguienteNodo, uleam.nodo);
});

test("the rescue fleet rides in demo rounds by default and never in evaluation unless asked", () => {
  assert.equal(parseEvento({ semilla: 1 }).flota, true);
  assert.equal(parseEvento({ semilla: 1, modo: "evaluacion" }).flota, false);
  assert.equal(parseEvento({ semilla: 1, modo: "evaluacion", flota: true }).flota, true);
  assert.equal(parseEvento({ semilla: 1, flota: false }).flota, false);
  assert.throws(() => parseEvento({ flota: "si" }), /flota/);
});

test("demo rounds chain back to back while the invocation has time for another full round", async () => {
  const { cliente, comandos } = clienteFalso();
  const restante = [12 * 60_000, 4 * 60_000]; // después de la ronda 1: hay tiempo para otra; después de la ronda 2: no
  const handler = crearHandler({ cliente, tabla: "t", reloj: crearRelojFake(), tiempoRestanteMs: () => restante.shift() ?? 0 });
  const r = await handler({ ronda: 1, semilla: 3 });
  assert.equal(r.iniciada, true);
  if (!r.iniciada) return;
  assert.equal(r.rondasJugadas, 2);
  const tomas = comandos.filter((c) => c instanceof PutCommand && c.input.Item?.PK === KEYS.control().PK);
  const ids = tomas.map((c) => (c as PutCommand).input.Item?.partidaId);
  assert.equal(ids.length, 2, "each round takes the lock with its own game id");
  assert.notEqual(ids[0], ids[1]);
});

test("evaluation rounds never chain, however much time is left", async () => {
  const { cliente } = clienteFalso();
  const handler = crearHandler({
    cliente,
    tabla: "t",
    reloj: crearRelojFake(),
    tiempoRestanteMs: () => 14 * 60_000,
    crearMotorHttp: () => ({ latencias: [] as number[], async pedirPaso(p: { nodoActual: string }) { return { siguienteNodo: p.nodoActual }; } }),
    pausaCalentamientoMs: 0,
  });
  const r = await handler({ ronda: 1, semilla: 3, modo: "evaluacion" });
  assert.equal(r.iniciada && r.rondasJugadas, 1);
});

test("if another round grabs the lock between two demo rounds, the chain stops quietly", async () => {
  let tomas = 0;
  const { cliente } = clienteFalso();
  const conCompetencia = {
    async send(comando: Comando) {
      if (comando instanceof PutCommand && comando.input.Item?.PK === KEYS.control().PK && ++tomas === 2) {
        throw Object.assign(new Error("occupied"), { name: "ConditionalCheckFailedException" });
      }
      return cliente.send(comando);
    },
  };
  const handler = crearHandler({ cliente: conCompetencia, tabla: "t", reloj: crearRelojFake(), tiempoRestanteMs: () => 12 * 60_000 });
  const r = await handler({ ronda: 1, semilla: 3 });
  assert.equal(r.iniciada && r.rondasJugadas, 1);
});
