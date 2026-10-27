import assert from "node:assert/strict";
import { test } from "node:test";
import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ErrorFuenteMundo } from "../motor/fuente-mundo";
import { DynamoFuente, type ClienteLecturaDynamo } from "./dynamo-fuente";
import { KEYS } from "./keys";

const NOW = 1_793_030_400_000;
const table = "test-world";
type Command = GetCommand | QueryCommand;
type Reply = { Item?: unknown; Items?: unknown[] };

class FakeDynamo implements ClienteLecturaDynamo {
  readonly commands: Command[] = [];
  constructor(private readonly respond: (command: Command) => Reply | Promise<Reply>) {}
  async send(command: Command): Promise<Reply> {
    this.commands.push(command);
    return this.respond(command);
  }
}

// Compile-time compatibility with the real SDK, without resolving credentials or sending requests.
const acceptRealClient = (client: DynamoDBDocumentClient): ClienteLecturaDynamo => client;

function snapshot(partidaId = "game-a", turno = 3) {
  return {
    ...KEYS.turno(partidaId, turno), ttl: NOW / 1000 + 86_400,
    data: {
      completo: false,
      zombies: [{ id: "Z-0001", tipo: "horda", nodo: "N-0002" }],
      aristasBloqueadas: ["C-0001"],
      sobrevivientes: [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }],
    },
  };
}

function expectCode(code: ErrorFuenteMundo["code"]) {
  return (error: unknown) => error instanceof ErrorFuenteMundo && error.code === code;
}

test("reads an incomplete turn strongly through KEYS and returns immutable danger only", async () => {
  const item = snapshot();
  const original = structuredClone(item);
  const client = new FakeDynamo(() => ({ Item: item }));
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const world = await source.obtenerTurno("game-a", 3);
  assert.deepEqual(world, {
    partidaId: "game-a", turno: 3,
    zombies: item.data.zombies, aristasBloqueadas: item.data.aristasBloqueadas,
  });
  assert.ok(client.commands[0] instanceof GetCommand);
  assert.deepEqual(client.commands[0].input, {
    TableName: table, Key: KEYS.turno("game-a", 3), ConsistentRead: true,
  });
  assert.equal(await source.obtenerTurno("game-a", 3), world);
  assert.equal(client.commands.length, 1);
  assert.ok(Object.isFrozen(world));
  assert.ok(Object.isFrozen(world.zombies));
  assert.ok(Object.isFrozen(world.aristasBloqueadas));
  assert.equal(Reflect.set(world.zombies[0], "nodo", "N-9999"), false);
  assert.deepEqual(item, original);
  assert.equal(typeof acceptRealClient, "function");
});

test("cache isolates both game identity and turn number", async () => {
  const client = new FakeDynamo((command) => {
    assert.ok(command instanceof GetCommand);
    const game = command.input.Key?.PK === KEYS.turno("game-b", 3).PK ? "game-b" : "game-a";
    const turn = command.input.Key?.SK === KEYS.turno(game, 4).SK ? 4 : 3;
    return { Item: snapshot(game, turn) };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  assert.equal((await source.obtenerTurno("game-a", 3)).partidaId, "game-a");
  assert.equal((await source.obtenerTurno("game-b", 3)).partidaId, "game-b");
  assert.equal((await source.obtenerTurno("game-a", 4)).turno, 4);
  await source.obtenerTurno("game-a", 3);
  assert.equal(client.commands.length, 3);
});

test("200 simultaneous requests for one game and turn share a single read", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = new FakeDynamo(async () => { await gate; return { Item: snapshot() }; });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const requests = Array.from({ length: 200 }, () => source.obtenerTurno("game-a", 3));
  assert.equal(client.commands.length, 1);
  release();
  const results = await Promise.all(requests);
  assert.ok(results.every((result) => result === results[0]));
  assert.equal(client.commands.length, 1);
});

test("a shared read failure is propagated and a later request can retry", async () => {
  const failure = new Error("transport unavailable");
  let fail = true;
  const client = new FakeDynamo(() => {
    if (fail) throw failure;
    return { Item: snapshot() };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const results = await Promise.allSettled([
    source.obtenerTurno("game-a", 3), source.obtenerTurno("game-a", 3),
  ]);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason === failure));
  assert.equal(client.commands.length, 1);
  fail = false;
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 3);
  assert.equal(client.commands.length, 2);
});

test("fallback queries only the same game up to N and never caches N-1 under N", async () => {
  let published = false;
  const client = new FakeDynamo((command) => command instanceof GetCommand
    ? { Item: published ? snapshot("game-a", 3) : undefined }
    : { Items: [snapshot("game-a", 2)] });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 2);
  assert.ok(client.commands[1] instanceof QueryCommand);
  assert.deepEqual(client.commands[1].input, {
    TableName: table, ConsistentRead: true,
    KeyConditionExpression: "#pk = :pk AND #sk BETWEEN :first AND :requested",
    ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
    ExpressionAttributeValues: {
      ":pk": KEYS.turno("game-a", 3).PK,
      ":first": KEYS.turno("game-a", 0).SK,
      ":requested": KEYS.turno("game-a", 3).SK,
    },
    ScanIndexForward: false, Limit: 1,
  });
  assert.equal((await source.obtenerTurno("game-a", 2)).turno, 2);
  assert.equal(client.commands.length, 2);
  published = true;
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 3);
  assert.equal(client.commands.length, 3);
});

test("accepts N published between the exact read and fallback query", async () => {
  const client = new FakeDynamo((command) => command instanceof GetCommand
    ? {} : { Items: [snapshot()] });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 3);
});

test("a missing game or turn raises a domain error and is not negative-cached", async () => {
  const client = new FakeDynamo(() => ({}));
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(source.obtenerTurno("game-a", 3), expectCode("TURN_NOT_FOUND"));
  }
  assert.equal(client.commands.length, 4);
});

test("rejects invalid requests before reading any storage", async () => {
  const client = new FakeDynamo(() => { throw new Error("must not read"); });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  for (const [game, turn] of [["", 3], ["game-a", -1], ["game-a", 1.5], ["game-a", NaN], ["game-a", 1_000_000]] as const) {
    await assert.rejects(source.obtenerTurno(game, turn), expectCode("INVALID_WORLD_REQUEST"));
  }
  assert.equal(client.commands.length, 0);
});

test("rejects corrupt or mismatched items instead of falling back to a safe empty world", async () => {
  const valid = snapshot();
  const invalid: unknown[] = [
    { ...valid, PK: KEYS.turno("other-game", 3).PK },
    { ...valid, SK: KEYS.turno("game-a", 2).SK },
    { ...valid, SK: `${KEYS.prefixes.turnos}3` },
    { ...valid, data: undefined },
    { ...valid, data: { ...valid.data, completo: "false" } },
    { ...valid, ttl: "tomorrow" },
    { ...valid, data: { ...valid.data, partidaId: "other-game" } },
    { ...valid, data: { ...valid.data, turno: 2 } },
    { ...valid, data: { ...valid.data, zombies: [{ id: "Z-1", tipo: "dormido", nodo: "N-0001" }] } },
    { ...valid, data: { ...valid.data, aristasBloqueadas: ["invalid"] } },
  ];
  for (const item of invalid) {
    const before = structuredClone(item);
    const client = new FakeDynamo(() => ({ Item: item }));
    const source = new DynamoFuente(client, table, { ahora: () => NOW });
    await assert.rejects(source.obtenerTurno("game-a", 3), expectCode("INVALID_WORLD_DATA"));
    assert.equal(client.commands.length, 1);
    assert.deepEqual(item, before);
  }
});

test("fallback rejects a future turn or a different game", async () => {
  for (const item of [snapshot("game-a", 4), snapshot("other-game", 2)]) {
    const client = new FakeDynamo((command) => command instanceof GetCommand ? {} : { Items: [item] });
    const source = new DynamoFuente(client, table, { ahora: () => NOW });
    await assert.rejects(source.obtenerTurno("game-a", 3), expectCode("INVALID_WORLD_DATA"));
  }
});

test("checks TTL on reads and cache hits rather than waiting for physical deletion", async () => {
  let now = NOW;
  const item = { ...snapshot(), ttl: NOW / 1000 + 1 };
  const client = new FakeDynamo(() => ({ Item: item }));
  const source = new DynamoFuente(client, table, { ahora: () => now });
  await source.obtenerTurno("game-a", 3);
  now += 1000;
  await assert.rejects(source.obtenerTurno("game-a", 3), expectCode("WORLD_EXPIRED"));
  assert.equal(client.commands.length, 2);
  item.ttl += 100;
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 3);
  assert.equal(client.commands.length, 3);
});

test("bounded cache evicts old turns without changing later reads", async () => {
  const client = new FakeDynamo((command) => {
    assert.ok(command instanceof GetCommand);
    const turn = Number(String(command.input.Key?.SK).slice(KEYS.prefixes.turnos.length));
    return { Item: snapshot("game-a", turn) };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW, maxTurnosEnCache: 2 });
  for (const turn of [1, 2, 3, 1]) assert.equal((await source.obtenerTurno("game-a", turn)).turno, turn);
  assert.equal(client.commands.length, 4);
});

test("200 requests also coalesce a missing turn's fallback query", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = new FakeDynamo(async (command) => {
    if (command instanceof GetCommand) return {};
    await gate;
    return { Items: [snapshot("game-a", 2)] };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const requests = Array.from({ length: 200 }, () => source.obtenerTurno("game-a", 3));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(client.commands.length, 2);
  release();
  const results = await Promise.all(requests);
  assert.ok(results.every((result) => result === results[0] && result.turno === 2));
  assert.equal(client.commands.length, 2);
});

test("a failed fallback query releases the shared read for a later retry", async () => {
  const failure = new Error("query unavailable");
  let fail = true;
  const client = new FakeDynamo((command) => {
    if (command instanceof GetCommand) return {};
    if (fail) throw failure;
    return { Items: [snapshot("game-a", 2)] };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const results = await Promise.allSettled([
    source.obtenerTurno("game-a", 3), source.obtenerTurno("game-a", 3),
  ]);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason === failure));
  assert.equal(client.commands.length, 2);
  fail = false;
  assert.equal((await source.obtenerTurno("game-a", 3)).turno, 2);
  assert.equal(client.commands.length, 4);
});

test("rejects a snapshot that expires while its read is in flight", async () => {
  let now = NOW;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = new FakeDynamo(async () => {
    await gate;
    return { Item: { ...snapshot(), ttl: NOW / 1000 + 1 } };
  });
  const source = new DynamoFuente(client, table, { ahora: () => now });
  const pending = source.obtenerTurno("game-a", 3);
  now += 1000;
  release();
  await assert.rejects(pending, expectCode("WORLD_EXPIRED"));
});

test("out-of-order reads never mix different games or turns", async () => {
  const releases: (() => void)[] = [];
  const items = [snapshot("game-a", 3), snapshot("game-a", 4), snapshot("game-b", 3)];
  const client = new FakeDynamo(async (command) => {
    assert.ok(command instanceof GetCommand);
    const item = items.find((entry) => entry.PK === command.input.Key?.PK && entry.SK === command.input.Key?.SK);
    assert.ok(item);
    await new Promise<void>((resolve) => { releases.push(resolve); });
    return { Item: item };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  const requests = [source.obtenerTurno("game-a", 3), source.obtenerTurno("game-a", 4), source.obtenerTurno("game-b", 3)];
  for (const release of [...releases].reverse()) release();
  const results = await Promise.all(requests);
  assert.deepEqual(results.map((world) => [world.partidaId, world.turno]), [["game-a", 3], ["game-a", 4], ["game-b", 3]]);
  for (const result of results) assert.equal(await source.obtenerTurno(result.partidaId, result.turno), result);
  assert.equal(client.commands.length, 3);
});

test("accepts the lower and upper limits of the six-digit turn keys", async () => {
  const client = new FakeDynamo((command) => {
    assert.ok(command instanceof GetCommand);
    return { Item: snapshot("game-a", Number(String(command.input.Key?.SK).slice(KEYS.prefixes.turnos.length))) };
  });
  const source = new DynamoFuente(client, table, { ahora: () => NOW });
  for (const turn of [0, 999_999]) assert.equal((await source.obtenerTurno("game-a", turn)).turno, turn);
});
