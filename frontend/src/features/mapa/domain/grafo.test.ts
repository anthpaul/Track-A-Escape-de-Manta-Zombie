import { test } from "node:test";
import assert from "node:assert/strict";
import { nodosBloqueadosPorHordas, vecinos } from "@/features/mapa/domain/grafo";
import type { Grafo } from "@/features/mapa/domain/tipos";

// N-0001 — N-0002 — N-0003 — N-0004 (a line)
const grafo: Grafo = {
  version: "test",
  nodos: [1, 2, 3, 4].map((i) => ({ id: `N-000${i}`, lat: -0.95 - i / 1000, lng: -80.72 })),
  calles: [
    { id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 100, tipo: "calle", geometria: [] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 100, tipo: "calle", geometria: [] },
    { id: "C-0003", desde: "N-0003", hasta: "N-0004", distancia_m: 100, tipo: "calle", geometria: [] },
  ],
  refugios: [],
};


test("neighbors are undirected", () => {
  const v = vecinos(grafo);
  assert.deepEqual(v.get("N-0002")?.sort(), ["N-0001", "N-0003"]);
  assert.deepEqual(v.get("N-0001"), ["N-0002"]);
});

test("a horde blocks its node and all its neighbors", () => {
  const bloqueados = nodosBloqueadosPorHordas(grafo, [
    { id: "Z-1", tipo: "horda", nodo: "N-0002" },
    { id: "Z-2", tipo: "caminante", nodo: "N-0004" },
  ]);
  assert.deepEqual([...bloqueados].sort(), ["N-0001", "N-0002", "N-0003"]);
});

