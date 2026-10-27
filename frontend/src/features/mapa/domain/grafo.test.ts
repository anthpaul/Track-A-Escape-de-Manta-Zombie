import { test } from "node:test";
import assert from "node:assert/strict";
import { nodosBloqueadosPorHordas, refugiosSinAcceso, vecinos } from "@/features/mapa/domain/grafo";
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


// N-0001 — … — N-0005 (a line) with the shelter at the far end, like Faro de Manta on its pier.
const muelle: Grafo = {
  version: "test",
  nodos: [1, 2, 3, 4, 5].map((i) => ({ id: `N-000${i}`, lat: -0.95 - i / 1000, lng: -80.72 })),
  calles: [1, 2, 3, 4].map((i) => ({
    id: `C-000${i}`,
    desde: `N-000${i}`,
    hasta: `N-000${i + 1}`,
    distancia_m: 100,
    tipo: "calle" as const,
    geometria: [],
  })),
  refugios: [{ id: "R-01", nodo: "N-0005", nombre: "Faro", capacidad: 10 }],
};
const enRuta = (nodo: string) => ({ id: "S-0001", nodo, estado: "en_ruta" as const });

test("a shelter is reachable when a survivor on the road has a free path to it", () => {
  const mundo = { zombies: [], aristasBloqueadas: [], sobrevivientes: [enRuta("N-0001")] };
  assert.deepEqual([...refugiosSinAcceso(muelle, mundo)], []);
});

test("a horde that blocks the only way in cuts the shelter off", () => {
  const mundo = { zombies: [{ id: "Z-1", tipo: "horda" as const, nodo: "N-0003" }], aristasBloqueadas: [], sobrevivientes: [enRuta("N-0001")] };
  assert.deepEqual([...refugiosSinAcceso(muelle, mundo)], ["R-01"]);
});

test("a blocked street on the only way in cuts the shelter off", () => {
  const mundo = { zombies: [], aristasBloqueadas: ["C-0004"], sobrevivientes: [enRuta("N-0001")] };
  assert.deepEqual([...refugiosSinAcceso(muelle, mundo)], ["R-01"]);
});

test("a shelter inside a horde zone is cut off even with nobody on the road", () => {
  const mundo = { zombies: [{ id: "Z-1", tipo: "horda" as const, nodo: "N-0004" }], aristasBloqueadas: [], sobrevivientes: [] };
  assert.deepEqual([...refugiosSinAcceso(muelle, mundo)], ["R-01"]);
});

test("with nobody on the road, a free shelter is not reported as cut off", () => {
  const mundo = { zombies: [{ id: "Z-1", tipo: "horda" as const, nodo: "N-0001" }], aristasBloqueadas: [], sobrevivientes: [] };
  assert.deepEqual([...refugiosSinAcceso(muelle, mundo)], []);
});
