import { test } from "node:test";
import assert from "node:assert/strict";
import { conteosCapas, conteosFiltro, filtrarSobrevivientes, resumenRefugios } from "./vistas";
import type { Grafo, Snapshot, Sobreviviente } from "./tipos";

const grafo: Grafo = {
  version: "t",
  nodos: [
    { id: "N-0001", lat: 0, lng: 0 },
    { id: "N-0002", lat: 0, lng: 0 },
    { id: "N-0003", lat: 0, lng: 0 },
  ],
  calles: [
    { id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 1, tipo: "calle", geometria: [] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 1, tipo: "calle", geometria: [] },
  ],
  refugios: [
    { id: "R-01", nodo: "N-0002", nombre: "Faro de Manta", capacidad: 10 },
    { id: "R-02", nodo: "N-0003", nombre: "ULEAM", capacidad: 4 },
  ],
};

const lista: Sobreviviente[] = [
  { id: "S-0001", nodo: "N-0001", estado: "en_ruta", refugio: "R-01", callesRestantes: 1 },
  { id: "S-0002", nodo: "N-0001", estado: "en_ruta", refugio: "R-02", callesRestantes: 2 },
  { id: "S-0003", nodo: "N-0001", estado: "mordido" },
  { id: "S-0004", nodo: "N-0003", estado: "a_salvo", refugio: "R-02" },
];

test("search matches the id or the destination name, case-insensitive", () => {
  assert.deepEqual(filtrarSobrevivientes(grafo, lista, "s-0003", "todos").map((s) => s.id), ["S-0003"]);
  assert.deepEqual(filtrarSobrevivientes(grafo, lista, "uleam", "todos").map((s) => s.id), ["S-0002", "S-0004"]);
});

test("search and status filter combine", () => {
  assert.deepEqual(filtrarSobrevivientes(grafo, lista, "uleam", "en_ruta").map((s) => s.id), ["S-0002"]);
});

test("chip counts follow the current search", () => {
  assert.deepEqual(conteosFiltro(grafo, lista, ""), { todos: 4, en_ruta: 2, mordido: 1, a_salvo: 1 });
  assert.deepEqual(conteosFiltro(grafo, lista, "uleam"), { todos: 2, en_ruta: 1, mordido: 0, a_salvo: 1 });
});

test("shelter summary: totals, percent, on-the-way count, blocked accesses and reachability", () => {
  const snap = {
    zombies: [],
    aristasBloqueadas: ["C-0002"],
    refugios: [
      { id: "R-01", ocupacion: 7, capacidad: 10 },
      { id: "R-02", ocupacion: 4, capacidad: 4 },
    ],
    sobrevivientes: lista,
  } as unknown as Snapshot;
  const r = resumenRefugios(grafo, snap);
  assert.equal(r.aSalvo, 11);
  assert.equal(r.capacidadLibre, 3);
  assert.deepEqual(
    r.refugios.map((x) => [x.id, x.nombre, x.pct, x.lleno, x.enCamino, x.accesosBloqueados, x.sinAcceso]),
    [
      // Survivors on the road stand on N-0001; C-0002 is the only street into ULEAM (N-0003).
      ["R-01", "Faro de Manta", 70, false, 1, 1, false],
      ["R-02", "ULEAM", 100, true, 1, 1, true],
    ],
  );
});

test("layer counts reflect what each layer would draw", () => {
  const snap = {
    zombies: [
      { id: "Z-1", tipo: "caminante", nodo: "N-0001" },
      { id: "Z-2", tipo: "horda", nodo: "N-0002" },
    ],
    sobrevivientes: lista,
  } as unknown as Snapshot;
  assert.deepEqual(conteosCapas(grafo, snap), { caminante: 1, corredor: 0, horda: 1, sobreviviente: 2, mordido: 1, refugio: 2 });
});

test("shelter rows count who is in danger on the way and say why a shelter has no access", () => {
  // N-0001 — N-0002 — N-0003 (ULEAM). Both survivors on the road stand on N-0001, next to a walker on N-0002.
  const snap = {
    zombies: [{ id: "Z-1", tipo: "caminante", nodo: "N-0002" }],
    aristasBloqueadas: [],
    refugios: [],
    sobrevivientes: [
      { id: "S-0001", nodo: "N-0001", estado: "en_ruta", refugio: "R-02" },
      { id: "S-0002", nodo: "N-0001", estado: "en_ruta", refugio: "R-01" },
      { id: "S-0003", nodo: "N-0001", estado: "mordido", refugio: "R-02" },
    ],
  } as unknown as Snapshot;
  const r = resumenRefugios(grafo, snap).refugios;
  assert.deepEqual(r.map((x) => [x.id, x.enCamino, x.enPeligro, x.motivoSinAcceso]), [
    ["R-01", 1, 1, null],
    ["R-02", 1, 1, null],
  ]);

  // A horde on N-0002 cuts both shelters off from N-0001; ULEAM is also cut by its closed street.
  const horda = { ...snap, zombies: [{ id: "Z-2", tipo: "horda", nodo: "N-0002" }] } as unknown as Snapshot;
  assert.deepEqual(resumenRefugios(grafo, horda).refugios.map((x) => x.motivoSinAcceso), ["horda", "horda"]);
  const cortada = { ...snap, zombies: [], aristasBloqueadas: ["C-0002"] } as unknown as Snapshot;
  assert.deepEqual(resumenRefugios(grafo, cortada).refugios.map((x) => x.motivoSinAcceso), [null, "calle"]);
});
