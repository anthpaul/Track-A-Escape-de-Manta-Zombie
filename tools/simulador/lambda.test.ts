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
  assert.ok(comandos.filter((c) => c instanceof TransactWriteCommand).length >= 2 * 150, "every turn is published twice");
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
  assert.deepEqual(parseEvento({ ronda: 3, semilla: 9 }), { ronda: 3, semilla: 9 });
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
