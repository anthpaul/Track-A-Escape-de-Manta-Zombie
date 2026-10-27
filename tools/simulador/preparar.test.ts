import assert from "node:assert/strict";
import { test } from "node:test";
import { prepararPartida } from "./preparar";

const config = () => ({
  semilla: 42,
  zombies: [{ id: "Z-1", tipo: "dormido", nodo: "N-0001" }],
  sobrevivientes: [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }],
});

test("loads the real graph and prepares turn zero without moving actors", async () => {
  const partida = await prepararPartida(config());
  assert.equal(partida.grafo.nodos.length, 284);
  assert.equal(partida.grafo.refugios.length, 4);
  assert.equal(partida.turno, 0);
  assert.deepEqual(partida.zombies, config().zombies);
  assert.deepEqual(partida.sobrevivientes, config().sobrevivientes);
});

test("the same seed produces the same random sequence", async () => {
  const a = await prepararPartida(config());
  const b = await prepararPartida(config());
  const sequence = Array.from({ length: 20 }, () => a.aleatorio());
  assert.deepEqual(sequence, Array.from({ length: 20 }, () => b.aleatorio()));
  assert.ok(sequence.every((n) => n >= 0 && n < 1));
  const c = await prepararPartida({ ...config(), semilla: 43 });
  assert.notDeepEqual(sequence, Array.from({ length: 20 }, () => c.aleatorio()));
});

test("rejects invalid seeds and initial states", async () => {
  for (const semilla of [-1, 1.5, 4294967296]) {
    await assert.rejects(prepararPartida({ ...config(), semilla }));
  }
  await assert.rejects(prepararPartida({ ...config(), sobrevivientes: [
    { id: "S-0001", nodo: "N-0002", estado: "mordido" },
  ] }));
});

test("rejects unknown nodes and duplicate actor IDs", async () => {
  await assert.rejects(prepararPartida({ ...config(), zombies: [
    { id: "Z-1", tipo: "caminante", nodo: "N-9999" },
  ] }), /Unknown node/);
  for (const collection of ["zombies", "sobrevivientes"] as const) {
    const input = config();
    await assert.rejects(prepararPartida({ ...input,
      [collection]: [...input[collection], ...input[collection]],
    }), /Duplicate ID/);
  }
});

test("preparation does not mutate or retain the input arrays", async () => {
  const input = config();
  const before = structuredClone(input);
  const partida = await prepararPartida(input);
  partida.zombies[0].nodo = "N-0003";
  assert.deepEqual(input, before);
});
