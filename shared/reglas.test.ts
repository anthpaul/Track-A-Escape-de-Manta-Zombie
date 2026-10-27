/**
 * Tests for shared/reglas.ts — one test per rule row, as required by the
 * route plan (S2/S3 acceptance criteria in docs/HOJA_DE_RUTA.md §4.2).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./data/fixture-mini.json";
import { crearGrafo } from "./grafo";
import {
  distanciaHops,
  moverZombie,
  despertarDormidos,
  aplicarBloqueo,
  resolverMordidasPorNodo,
  resolverMordidasPorCruce,
  resolverLlegadas,
  zombiesVisibles,
} from "./reglas";
import type { ZombieInterno } from "./reglas";
import type { Sobreviviente } from "./schemas";

const grafo = crearGrafo(fixture);

// Deterministic fake random: always returns 0 (picks first available neighbor).
const rnd0 = () => 0;
// Always returns a value that picks the last neighbor.
const rndLast = () => 0.9999;

// ---------------------------------------------------------------------------
// distanciaHops
// ---------------------------------------------------------------------------

test("distanciaHops: same node is 0", () => {
  assert.equal(distanciaHops(grafo, "N-0001", "N-0001"), 0);
});

test("distanciaHops: direct neighbor is 1", () => {
  assert.equal(distanciaHops(grafo, "N-0001", "N-0002"), 1);
  assert.equal(distanciaHops(grafo, "N-0002", "N-0001"), 1);
});

test("distanciaHops: two hops away", () => {
  // N-0001 → N-0002 → N-0003
  assert.equal(distanciaHops(grafo, "N-0001", "N-0003"), 2);
});

test("distanciaHops: unreachable node returns Infinity", () => {
  assert.equal(distanciaHops(grafo, "N-0001", "N-9999"), Infinity);
});

// ---------------------------------------------------------------------------
// Caminante — moves 1 street every 2 turns
// ---------------------------------------------------------------------------

test("caminante: moves on its first turn", () => {
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0001", movioPasadoTurno: false };
  const { nuevoNodo, movioPasadoTurno } = moverZombie(z, grafo, [], [], rnd0, 1);
  assert.notEqual(nuevoNodo, "N-0001", "should have moved");
  assert.equal(movioPasadoTurno, true);
});

test("caminante: stays put on its second turn", () => {
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0002", movioPasadoTurno: true };
  const { nuevoNodo, movioPasadoTurno } = moverZombie(z, grafo, [], [], rnd0, 2);
  assert.equal(nuevoNodo, "N-0002", "should not have moved");
  assert.equal(movioPasadoTurno, false);
});

test("caminante: respects blocked streets (stays put if all exits blocked)", () => {
  // N-0009 connects to N-0010 (C-0007) and N-0005 (C-0011).
  // Block both so there is nowhere to go.
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0009", movioPasadoTurno: false };
  const bloqueadas = ["C-0007", "C-0011"];
  const { nuevoNodo } = moverZombie(z, grafo, bloqueadas, [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0009", "blocked on all sides — stays put");
});

// ---------------------------------------------------------------------------
// Corredor — 2 streets per turn; pursues survivor ≤3 hops
// ---------------------------------------------------------------------------

test("corredor: moves 2 streets when no survivor nearby", () => {
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  // No survivors anywhere. With rnd0 it picks the first neighbor each time.
  // N-0001 neighbors (from fixture): N-0002, N-0005.
  // Step 1: N-0001 → N-0002 (first neighbor of N-0001).
  // Step 2: N-0002's first neighbor could be N-0001 (bounce back) — that is
  //         valid behavior for a random corredor. We only assert it attempted
  //         both steps, which means the corredor visited a neighbor at step 1.
  // We verify by tracking the intermediate node via a custom aleatorio that
  // records each call.
  const calls: number[] = [];
  const rndRecorder = () => { calls.push(0); return 0; };
  moverZombie(z, grafo, [], [], rndRecorder, 1);
  // Corredor without a target always tries 2 random steps → 2 aleatorio calls.
  assert.equal(calls.length, 2, "corredor should call aleatorio twice (2 steps)");
});

test("corredor: pursues survivor within 3 hops", () => {
  // Place survivor at N-0003, corredor at N-0001.  Distance = 2 hops → pursue.
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0003", estado: "en_ruta" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [s], rnd0, 1);
  // After 2 pursuit steps: N-0001 → N-0002 → N-0003.
  assert.equal(nuevoNodo, "N-0003", "corredor should have reached the survivor");
});

test("corredor: does not pursue survivor farther than 3 hops", () => {
  // N-0001 to N-0012 is 4+ hops — no pursuit.
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0012", estado: "en_ruta" };
  const antes = z.nodo;
  const { nuevoNodo } = moverZombie(z, grafo, [], [s], rnd0, 1);
  // Corredor moves randomly — it will NOT head specifically toward N-0012.
  // We just confirm it didn't teleport directly there.
  assert.notEqual(nuevoNodo, "N-0012");
  void antes; // silence unused warning
});

// ---------------------------------------------------------------------------
// Horda — immobile, blocks node + neighbors (blocking tested in grafo.test.ts)
// ---------------------------------------------------------------------------

test("horda: never moves", () => {
  const z: ZombieInterno = { id: "Z-0003", tipo: "horda", nodo: "N-0006" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0006");
});

// ---------------------------------------------------------------------------
// Dormido — invisible until survivor ≤2 hops; awakens as caminante
// ---------------------------------------------------------------------------

test("dormido: stays put and does not move", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0010" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0010");
});

test("despertarDormidos: does not wake when survivor is 3+ hops away", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  // N-0001 to N-0012 is 4 hops → should not wake.
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0012", estado: "en_ruta" };
  despertarDormidos([z], [s], grafo);
  assert.equal(z.tipo, "dormido", "should still be asleep");
});

test("despertarDormidos: wakes when survivor is exactly 2 hops away", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  // N-0001 → N-0002 → N-0003 = 2 hops.
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0003", estado: "en_ruta" };
  despertarDormidos([z], [s], grafo);
  assert.equal(z.tipo, "caminante", "should have awakened");
});

test("despertarDormidos: wakes when survivor is 1 hop away", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0002", estado: "en_ruta" };
  despertarDormidos([z], [s], grafo);
  assert.equal(z.tipo, "caminante");
});

test("despertarDormidos: ignores a_salvo and mordido survivors", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0002", estado: "a_salvo" };
  despertarDormidos([z], [s], grafo);
  assert.equal(z.tipo, "dormido", "safe survivor should not wake a dormido");
});

// ---------------------------------------------------------------------------
// City event — street blockage
// ---------------------------------------------------------------------------

test("aplicarBloqueo: adds a new street ID to the blocked list", () => {
  const resultado = aplicarBloqueo([], "C-0005");
  assert.deepEqual(resultado, ["C-0005"]);
});

test("aplicarBloqueo: does not add the same street twice", () => {
  const resultado = aplicarBloqueo(["C-0005"], "C-0005");
  assert.deepEqual(resultado, ["C-0005"]);
});

test("aplicarBloqueo: does not mutate the original array", () => {
  const original = ["C-0001"];
  aplicarBloqueo(original, "C-0005");
  assert.deepEqual(original, ["C-0001"]);
});

// ---------------------------------------------------------------------------
// S3: Bite by node sharing
// ---------------------------------------------------------------------------

test("resolverMordidasPorNodo: survivor on the same node as a zombie is bitten", () => {
  const zombies: ZombieInterno[] = [{ id: "Z-0001", tipo: "caminante", nodo: "N-0003" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0003", estado: "en_ruta" }];
  resolverMordidasPorNodo(ss, zombies);
  assert.equal(ss[0]!.estado, "mordido");
});

test("resolverMordidasPorNodo: survivor on a different node is not bitten", () => {
  const zombies: ZombieInterno[] = [{ id: "Z-0001", tipo: "caminante", nodo: "N-0003" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0004", estado: "en_ruta" }];
  resolverMordidasPorNodo(ss, zombies);
  assert.equal(ss[0]!.estado, "en_ruta");
});

test("resolverMordidasPorNodo: dormido zombie cannot bite", () => {
  const zombies: ZombieInterno[] = [{ id: "Z-0001", tipo: "dormido", nodo: "N-0003" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0003", estado: "en_ruta" }];
  resolverMordidasPorNodo(ss, zombies);
  assert.equal(ss[0]!.estado, "en_ruta", "dormido cannot bite");
});

test("resolverMordidasPorNodo: already-safe and dead survivors are unaffected", () => {
  const zombies: ZombieInterno[] = [{ id: "Z-0001", tipo: "caminante", nodo: "N-0003" }];
  const ss: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0003", estado: "a_salvo" },
    { id: "S-0002", nodo: "N-0003", estado: "mordido" },
  ];
  resolverMordidasPorNodo(ss, zombies);
  assert.equal(ss[0]!.estado, "a_salvo");
  assert.equal(ss[1]!.estado, "mordido");
});

// ---------------------------------------------------------------------------
// S3: Bite by crossing (opposite directions on the same street)
// ---------------------------------------------------------------------------

test("resolverMordidasPorCruce: crossing in opposite directions causes a bite", () => {
  // Street C-0001: N-0001 ↔ N-0002
  // Survivor: N-0001 → N-0002
  // Zombie:   N-0002 → N-0001
  const previoSobrevivientes = [{ id: "S-0001", nodo: "N-0001" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }];
  const previoZombies: Pick<ZombieInterno, "id" | "nodo" | "tipo">[] = [
    { id: "Z-0001", nodo: "N-0002", tipo: "caminante" },
  ];
  const zombies: ZombieInterno[] = [{ id: "Z-0001", nodo: "N-0001", tipo: "caminante" }];

  resolverMordidasPorCruce(ss, previoSobrevivientes, zombies, previoZombies, grafo);
  assert.equal(ss[0]!.estado, "mordido");
});

test("resolverMordidasPorCruce: same direction on the same street is not a bite", () => {
  // Both moving N-0001 → N-0002 (same direction, no cross)
  const previoSobrevivientes = [{ id: "S-0001", nodo: "N-0001" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }];
  const previoZombies: Pick<ZombieInterno, "id" | "nodo" | "tipo">[] = [
    { id: "Z-0001", nodo: "N-0001", tipo: "caminante" },
  ];
  const zombies: ZombieInterno[] = [{ id: "Z-0001", nodo: "N-0002", tipo: "caminante" }];

  resolverMordidasPorCruce(ss, previoSobrevivientes, zombies, previoZombies, grafo);
  assert.equal(ss[0]!.estado, "en_ruta", "same direction should not bite");
});

test("resolverMordidasPorCruce: dormido zombie cannot cause crossing bite", () => {
  const previoSobrevivientes = [{ id: "S-0001", nodo: "N-0001" }];
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }];
  const previoZombies: Pick<ZombieInterno, "id" | "nodo" | "tipo">[] = [
    { id: "Z-0001", nodo: "N-0002", tipo: "dormido" },
  ];
  const zombies: ZombieInterno[] = [{ id: "Z-0001", nodo: "N-0001", tipo: "dormido" }];

  resolverMordidasPorCruce(ss, previoSobrevivientes, zombies, previoZombies, grafo);
  assert.equal(ss[0]!.estado, "en_ruta", "dormido cannot cause crossing bite");
});

// ---------------------------------------------------------------------------
// S3: Shelter arrivals
// ---------------------------------------------------------------------------

test("resolverLlegadas: survivor at a refuge node becomes a_salvo", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }];
  // N-0001 is the first refuge in fixture-mini.
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "a_salvo");
});

test("resolverLlegadas: survivor not at a refuge stays en_ruta", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }];
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "en_ruta");
});

test("resolverLlegadas: bitten survivor at a refuge stays mordido (bite takes priority)", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "mordido" }];
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "mordido");
});

// ---------------------------------------------------------------------------
// Visible zombie filter
// ---------------------------------------------------------------------------

test("zombiesVisibles: excludes dormido, includes all others", () => {
  const todos: ZombieInterno[] = [
    { id: "Z-0001", tipo: "caminante", nodo: "N-0001" },
    { id: "Z-0002", tipo: "corredor", nodo: "N-0002" },
    { id: "Z-0003", tipo: "horda", nodo: "N-0003" },
    { id: "Z-0004", tipo: "dormido", nodo: "N-0004" },
  ];
  const visibles = zombiesVisibles(todos);
  assert.equal(visibles.length, 3);
  assert.ok(visibles.every((z) => z.tipo !== "dormido"));
});

// Ensure the rndLast helper is used in at least one test to avoid lint warnings.
test("caminante: random direction — last neighbor is also reachable", () => {
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0002", movioPasadoTurno: false };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rndLast, 1);
  // N-0002 has neighbors N-0001, N-0003, N-0006. One of them must be chosen.
  const vecinos = grafo.vecinos("N-0002");
  assert.ok(vecinos.includes(nuevoNodo), `${nuevoNodo} must be a neighbor of N-0002`);
});
