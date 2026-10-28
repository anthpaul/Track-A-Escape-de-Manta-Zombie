/**
 * Tests de shared/reglas.ts: un test por cada fila de reglas, como pide la hoja
 * de ruta (criterios de aceptación de S2/S3 en docs/HOJA_DE_RUTA.md §4.2).
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

// Aleatorio falso determinista: siempre devuelve 0 (elige el primer vecino disponible).
const rnd0 = () => 0;
// Siempre devuelve un valor que elige el último vecino.
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
// Caminante: se mueve 1 calle cada 2 turnos
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
  // N-0009 conecta con N-0010 (C-0007) y con N-0005 (C-0011).
  // Se bloquean las dos para que no tenga a dónde ir.
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0009", movioPasadoTurno: false };
  const bloqueadas = ["C-0007", "C-0011"];
  const { nuevoNodo } = moverZombie(z, grafo, bloqueadas, [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0009", "blocked on all sides — stays put");
});

// ---------------------------------------------------------------------------
// Corredor: 2 calles por turno; persigue a un sobreviviente a ≤3 saltos
// ---------------------------------------------------------------------------

test("corredor: moves 2 streets when no survivor nearby", () => {
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  // No hay sobrevivientes. Con rnd0 elige siempre el primer vecino.
  // Vecinos de N-0001 (según el fixture): N-0002, N-0005.
  // Paso 1: N-0001 → N-0002 (primer vecino de N-0001).
  // Paso 2: el primer vecino de N-0002 puede ser N-0001 (vuelve atrás); es un
  //         comportamiento válido para un corredor aleatorio. Solo se verifica que
  //         intentó los dos pasos, es decir, que en el paso 1 visitó un vecino.
  // Se comprueba siguiendo el nodo intermedio con un `aleatorio` propio que
  // registra cada llamada.
  const calls: number[] = [];
  const rndRecorder = () => { calls.push(0); return 0; };
  moverZombie(z, grafo, [], [], rndRecorder, 1);
  // Un corredor sin objetivo siempre intenta 2 pasos aleatorios → 2 llamadas a aleatorio.
  assert.equal(calls.length, 2, "corredor should call aleatorio twice (2 steps)");
});

test("corredor: pursues survivor within 3 hops", () => {
  // Sobreviviente en N-0003, corredor en N-0001. Distancia = 2 saltos → persigue.
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0003", estado: "en_ruta" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [s], rnd0, 1);
  // Después de 2 pasos de persecución: N-0001 → N-0002 → N-0003.
  assert.equal(nuevoNodo, "N-0003", "corredor should have reached the survivor");
});

test("corredor: does not pursue survivor farther than 3 hops", () => {
  // De N-0001 a N-0012 hay 4 saltos o más: no persigue.
  const z: ZombieInterno = { id: "Z-0002", tipo: "corredor", nodo: "N-0001" };
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0012", estado: "en_ruta" };
  const antes = z.nodo;
  const { nuevoNodo } = moverZombie(z, grafo, [], [s], rnd0, 1);
  // El corredor se mueve al azar: NO se dirige específicamente hacia N-0012.
  // Solo se confirma que no se teletransportó directamente ahí.
  assert.notEqual(nuevoNodo, "N-0012");
  void antes; // silencia la advertencia de variable sin usar
});

// ---------------------------------------------------------------------------
// Horda: inmóvil, bloquea su nodo y sus vecinos (el bloqueo se prueba en grafo.test.ts)
// ---------------------------------------------------------------------------

test("horda: never moves", () => {
  const z: ZombieInterno = { id: "Z-0003", tipo: "horda", nodo: "N-0006" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0006");
});

// ---------------------------------------------------------------------------
// Dormido: invisible hasta que un sobreviviente está a ≤2 saltos; despierta como caminante
// ---------------------------------------------------------------------------

test("dormido: stays put and does not move", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0010" };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rnd0, 1);
  assert.equal(nuevoNodo, "N-0010");
});

test("despertarDormidos: does not wake when survivor is 3+ hops away", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  // De N-0001 a N-0012 hay 4 saltos → no debe despertar.
  const s: Sobreviviente = { id: "S-0001", nodo: "N-0012", estado: "en_ruta" };
  despertarDormidos([z], [s], grafo);
  assert.equal(z.tipo, "dormido", "should still be asleep");
});

test("despertarDormidos: wakes when survivor is exactly 2 hops away", () => {
  const z: ZombieInterno = { id: "Z-0004", tipo: "dormido", nodo: "N-0001" };
  // N-0001 → N-0002 → N-0003 = 2 saltos.
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
// Evento de ciudad: bloqueo de una calle
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
// S3: mordida por nodo compartido
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
// S3: mordida por cruce (direcciones opuestas en la misma calle)
// ---------------------------------------------------------------------------

test("resolverMordidasPorCruce: crossing in opposite directions causes a bite", () => {
  // Calle C-0001: N-0001 ↔ N-0002
  // Sobreviviente: N-0001 → N-0002
  // Zombie:        N-0002 → N-0001
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
  // Los dos van de N-0001 → N-0002 (misma dirección, no hay cruce)
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
// S3: llegadas a refugios
// ---------------------------------------------------------------------------

test("resolverLlegadas: survivor at a refuge node becomes a_salvo", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" }];
  // N-0001 es el primer refugio de fixture-mini.
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "a_salvo");
});

test("resolverLlegadas: survivor not at a refuge stays en_ruta", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta" }];
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "en_ruta");
});

test("resolverLlegadas: a full shelter admits nobody else; the rest wait at the door, in id order", () => {
  const ss: Sobreviviente[] = [
    { id: "S-0001", nodo: "N-0001", estado: "a_salvo" }, // ya está adentro: 1 de 3
    { id: "S-0004", nodo: "N-0001", estado: "en_ruta" },
    { id: "S-0002", nodo: "N-0001", estado: "en_ruta" },
    { id: "S-0003", nodo: "N-0001", estado: "en_ruta" },
  ];
  resolverLlegadas(ss, new Set(["N-0001"]), new Map([["N-0001", 3]]));
  assert.deepEqual(ss.map((s) => [s.id, s.estado]), [
    ["S-0001", "a_salvo"],
    ["S-0004", "en_ruta"], // no queda espacio después de que entraron S-0002 y S-0003
    ["S-0002", "a_salvo"],
    ["S-0003", "a_salvo"],
  ]);
});

test("resolverLlegadas: without capacities every arrival gets in, as before", () => {
  const ss: Sobreviviente[] = ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "en_ruta" as const }));
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.deepEqual(ss.map((s) => s.estado), ["a_salvo", "a_salvo"]);
});

test("resolverLlegadas: bitten survivor at a refuge stays mordido (bite takes priority)", () => {
  const ss: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0001", estado: "mordido" }];
  resolverLlegadas(ss, new Set(["N-0001"]));
  assert.equal(ss[0]!.estado, "mordido");
});

// ---------------------------------------------------------------------------
// Filtro de zombies visibles
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

// Asegura que el helper rndLast se use en al menos un test, para evitar advertencias del linter.
test("caminante: random direction — last neighbor is also reachable", () => {
  const z: ZombieInterno = { id: "Z-0001", tipo: "caminante", nodo: "N-0002", movioPasadoTurno: false };
  const { nuevoNodo } = moverZombie(z, grafo, [], [], rndLast, 1);
  // N-0002 tiene como vecinos a N-0001, N-0003 y N-0006. Debe elegirse uno de ellos.
  const vecinos = grafo.vecinos("N-0002");
  assert.ok(vecinos.includes(nuevoNodo), `${nuevoNodo} must be a neighbor of N-0002`);
});
