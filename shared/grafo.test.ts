import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./data/fixture-mini.json";
import { crearGrafo, VELOCIDADES_M_S } from "./index";

test("indexes bidirectional neighbors and finds the same street in either direction", () => {
  const graph = crearGrafo(fixture);
  assert.deepEqual([...graph.vecinos("N-0001")].sort(), ["N-0002", "N-0005"]);
  assert.ok(graph.vecinos("N-0002").includes("N-0001"));
  assert.equal(graph.calleEntre("N-0001", "N-0002")?.id, "C-0001");
  assert.deepEqual(graph.calleEntre("N-0002", "N-0001"), graph.calleEntre("N-0001", "N-0002"));
  assert.equal(graph.calleEntre("N-0001", "N-0012"), undefined);
  assert.equal(graph.calleEntre("N-0001", "N-0001"), undefined);
  assert.deepEqual(graph.vecinos("N-9999"), []);
});

test("allows staying on an existing node and only moving along an unblocked street", () => {
  const graph = crearGrafo(fixture);
  for (const blocked of [[], new Set<string>()]) {
    assert.equal(graph.esMovimientoValido("N-0001", "N-0001", blocked), true);
    assert.equal(graph.esMovimientoValido("N-0001", "N-0002", blocked), true);
    assert.equal(graph.esMovimientoValido("N-0002", "N-0001", blocked), true);
    assert.equal(graph.esMovimientoValido("N-0001", "N-0012", blocked), false);
    assert.equal(graph.esMovimientoValido("N-9999", "N-9999", blocked), false);
    assert.equal(graph.esMovimientoValido("N-0001", "N-9999", blocked), false);
  }
  for (const blocked of [["C-0001"], new Set(["C-0001"])]) {
    assert.equal(graph.esMovimientoValido("N-0001", "N-0002", blocked), false);
    assert.equal(graph.esMovimientoValido("N-0002", "N-0001", blocked), false);
    assert.equal(graph.esMovimientoValido("N-0001", "N-0001", blocked), true);
    assert.equal(graph.esMovimientoValido("N-0001", "N-0005", blocked), true);
  }
});

test("hordes block their own node and immediate static neighbors, not two hops", () => {
  const graph = crearGrafo(fixture);
  const zombie = { id: "Z-0001", tipo: "horda" as const, nodo: "N-0001" };
  assert.deepEqual([...graph.nodosBloqueadosPorHordas([zombie])].sort(), ["N-0001", "N-0002", "N-0005"]);
  const blocked = graph.nodosBloqueadosPorHordas([zombie, { ...zombie, id: "Z-0002", nodo: "N-0002" }]);
  assert.deepEqual([...blocked].sort(), ["N-0001", "N-0002", "N-0003", "N-0005", "N-0006"]);
  for (const tipo of ["caminante", "corredor", "dormido"] as const) {
    assert.equal(graph.nodosBloqueadosPorHordas([{ ...zombie, tipo }]).size, 0);
  }
  assert.equal(graph.nodosBloqueadosPorHordas([]).size, 0);
});

test("validates once, keeps topology separate from danger, and does not mutate input", () => {
  const before = structuredClone(fixture);
  const graph = crearGrafo(fixture);
  graph.nodosBloqueadosPorHordas([{ id: "Z-0001", tipo: "horda", nodo: "N-0001" }]);
  assert.equal(graph.esMovimientoValido("N-0001", "N-0002", []), true);
  assert.deepEqual(fixture, before);
  assert.throws(() => crearGrafo({ ...fixture, calles: [{ ...fixture.calles[0], hasta: "N-9999" }] }));
  assert.deepEqual(VELOCIDADES_M_S, { avenida: 1.6, calle: 1.4, puente: 1.2, callejon: 1.0 });
});

test("the mini fixture is connected and both shelters are reachable from every barrio", () => {
  const graph = crearGrafo(fixture);
  for (const barrio of ["tarqui", "los_esteros", "barbasquillo", "jocay"]) {
    const start = fixture.nodos.find((node) => node.barrio === barrio);
    assert.ok(start);
    const visited = new Set([start.id]);
    const pending = [start.id];
    for (let i = 0; i < pending.length; i++) {
      for (const neighbor of graph.vecinos(pending[i])) {
        if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
      }
    }
    assert.equal(visited.size, 12);
    assert.ok(fixture.refugios.every((shelter) => visited.has(shelter.nodo)));
  }
});
