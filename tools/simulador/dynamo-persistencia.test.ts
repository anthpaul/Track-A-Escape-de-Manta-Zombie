import assert from "node:assert/strict";
import { test } from "node:test";
import { PutCommand, TransactWriteCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoPersistencia } from "./dynamo-persistencia";
import { KEYS } from "../../backend/src/db/keys";

test("Dynamo round acquires conditionally, fences writes and publishes final world before release", async () => {
  const commands: Array<PutCommand | TransactWriteCommand | DeleteCommand> = [];
  const store = new DynamoPersistencia({ async send(command) { commands.push(command); return {}; } }, "test", "evaluacion-r1-123", 1, () => 1_000_000);
  assert.equal(await store.iniciar(42), true);
  assert.ok(commands[0] instanceof PutCommand);
  assert.deepEqual((commands[0] as PutCommand).input.Item?.PK, KEYS.control().PK);
  assert.match((commands[0] as PutCommand).input.ConditionExpression!, /attribute_not_exists/);
  await store.guardarTurnoIncompleto({ turno: 1, zombies: [], aristasBloqueadas: [], sobrevivientes: [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }] });
  const partial = commands.at(-1) as TransactWriteCommand;
  assert.ok(partial instanceof TransactWriteCommand);
  assert.equal(partial.input.TransactItems?.[0]?.Update?.ExpressionAttributeValues?.[":mia"], "evaluacion-r1-123");
  const final = [{ id: "S-0001", nodo: "N-0002", estado: "a_salvo" as const }];
  await store.completarTurno(1, new Map([["S-0001", "N-0002"]]), final);
  const complete = commands.at(-1) as TransactWriteCommand;
  assert.deepEqual(complete.input.TransactItems?.[0]?.ConditionCheck?.Key, KEYS.control());
  assert.equal((await store.leerUltimoTurnoCompleto())?.sobrevivientes[0]?.estado, "a_salvo");
  await store.cerrar();
  assert.ok(commands.at(-1) instanceof DeleteCommand);
  assert.match((commands.at(-1) as DeleteCommand).input.ConditionExpression!, /partidaId/);
});

test("an occupied round is not preempted and a failed fence prevents local completion", async () => {
  let fail = true;
  const store = new DynamoPersistencia({ async send(command) {
    if (fail) throw Object.assign(new Error("occupied"), { name: "ConditionalCheckFailedException" });
    if (command instanceof TransactWriteCommand) throw new Error("lost lock");
    return {};
  } }, "test", "evaluacion-r1-123", 1);
  assert.equal(await store.iniciar(42), false);
  fail = false;
  await assert.rejects(store.guardarTurnoIncompleto({ turno: 1, zombies: [], sobrevivientes: [], aristasBloqueadas: [] }));
  assert.equal(await store.leerTurno(1), undefined);
});
