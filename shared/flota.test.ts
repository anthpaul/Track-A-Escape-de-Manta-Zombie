/**
 * Rescue fleet (Pro): who to pick up and in what order, on fixture-mini.json.
 *
 *   N-0001(R-01) — N-0002 — N-0003 — N-0004
 *      |             |                  |
 *   N-0005 ——————— N-0006 — N-0007 — N-0008
 *      |             |                  |
 *   N-0009 ——————— N-0010 — N-0011 — N-0012(R-02)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./data/fixture-mini.json";
import { crearGrafo } from "./grafo";
import { crearFlota, moverFlota, type MundoFlota, type Vehiculo } from "./flota";
import { resolverMordidasPorNodo } from "./reglas";
import type { Sobreviviente, Zombie } from "./schemas";

const grafo = crearGrafo(fixture);
const nodosRefugio = new Set(["N-0001", "N-0012"]);
const mundo = (sobrevivientes: Sobreviviente[], zombies: Zombie[] = [], capacidad = 50): MundoFlota => ({
  grafo,
  sobrevivientes,
  zombies,
  aristasBloqueadas: [],
  nodosRefugio,
  capacidadRefugio: new Map([...nodosRefugio].map((n) => [n, capacidad])),
});
const camioneta = (nodo: string, pasajeros: string[] = []): Vehiculo => ({ id: "V-1", nodo, pasajeros, destino: null });
const aPie = (id: string, nodo: string): Sobreviviente => ({ id, nodo, estado: "en_ruta" });

test("five vans start at the shelters, taking turns", () => {
  assert.deepEqual(crearFlota([...nodosRefugio]).map((v) => [v.id, v.nodo]), [
    ["V-1", "N-0001"], ["V-2", "N-0012"], ["V-3", "N-0001"], ["V-4", "N-0012"], ["V-5", "N-0001"],
  ]);
});

test("a van moves up to two streets a turn and picks up the person waiting there", () => {
  const s = aPie("S-0001", "N-0003"); // 2 streets from R-01: alone it needs 2 turns, the van 1
  const v = camioneta("N-0001");
  const eventos = moverFlota([v], mundo([s]));
  assert.equal(v.nodo, "N-0003");
  assert.deepEqual(v.pasajeros, ["S-0001"]);
  assert.deepEqual([s.vehiculo, s.nodo, s.estado], ["V-1", "N-0003", "en_ruta"]);
  assert.deepEqual(eventos, [{ tipo: "recogio", vehiculo: "V-1", nodo: "N-0003", sobrevivientes: ["S-0001"] }]);
});

test("someone with a zombie two streets away goes first, even if farther from the van", () => {
  const tranquilo = aPie("S-0001", "N-0003");
  const enPeligro = aPie("S-0002", "N-0007");
  const v = camioneta("N-0001");
  // The walker on N-0010 is 2 streets from N-0007 (via N-0006) and 3 from N-0003.
  moverFlota([v], mundo([tranquilo, enPeligro], [{ id: "Z-1", tipo: "caminante", nodo: "N-0010" }]));
  assert.equal(v.destino, "N-0007");
});

test("a van does not fetch someone who reaches a shelter alone sooner", () => {
  const s = aPie("S-0001", "N-0002"); // 1 street from R-01; the van at R-02 is 4 streets away
  const v = camioneta("N-0012");
  assert.deepEqual(moverFlota([v], mundo([s])), []);
  assert.deepEqual([v.nodo, v.destino, v.pasajeros], ["N-0012", null, []]);
});

test("a full van drives to the closest shelter with room and everyone gets out safe", () => {
  const arriba = ["S-0001", "S-0002", "S-0003", "S-0004"].map((id) => ({ ...aPie(id, "N-0003"), vehiculo: "V-1" }));
  const v = camioneta("N-0003", arriba.map((s) => s.id));
  const eventos = moverFlota([v], mundo(arriba));
  assert.equal(v.nodo, "N-0001");
  assert.deepEqual(v.pasajeros, []);
  assert.ok(arriba.every((s) => s.estado === "a_salvo" && s.nodo === "N-0001" && s.vehiculo === undefined));
  assert.deepEqual(eventos.at(-1), { tipo: "dejo", vehiculo: "V-1", nodo: "N-0001", sobrevivientes: ["S-0001", "S-0002", "S-0003", "S-0004"] });
});

test("a full shelter is skipped: the van heads to one with room", () => {
  const dentro: Sobreviviente = { id: "S-0009", nodo: "N-0001", estado: "a_salvo" };
  const arriba = ["S-0001", "S-0002", "S-0003", "S-0004"].map((id) => ({ ...aPie(id, "N-0003"), vehiculo: "V-1" }));
  const v = camioneta("N-0003", arriba.map((s) => s.id));
  moverFlota([v], mundo([dentro, ...arriba], [], 1));
  assert.equal(v.destino, "N-0012");
});

test("a van never drives onto a zombie: it takes the long way around", () => {
  const s = aPie("S-0001", "N-0003"); // a walker on N-0002, next to them: they are in danger
  const v = camioneta("N-0001");
  moverFlota([v], mundo([s], [{ id: "Z-1", tipo: "caminante", nodo: "N-0002" }]));
  assert.equal(v.nodo, "N-0006", "N-0001 → N-0005 → N-0006, never through N-0002");
});

test("people riding a van cannot be bitten", () => {
  const arriba: Sobreviviente[] = [{ id: "S-0001", nodo: "N-0002", estado: "en_ruta", vehiculo: "V-1" }];
  resolverMordidasPorNodo(arriba, [{ id: "Z-1", tipo: "caminante", nodo: "N-0002" }]);
  assert.equal(arriba[0]!.estado, "en_ruta");
});
