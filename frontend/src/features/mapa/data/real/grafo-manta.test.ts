import { test } from "node:test";
import assert from "node:assert/strict";
import { grafoManta } from "./grafo-manta";
import { vecinos } from "@/features/mapa/domain/grafo";

test("the real graph has the agreed size and four shelters", () => {
  assert.ok(grafoManta.nodos.length >= 250 && grafoManta.nodos.length <= 350, `nodes: ${grafoManta.nodos.length}`);
  assert.equal(grafoManta.refugios.length, 4);
  assert.ok(grafoManta.calles.some((c) => c.tipo === "puente"), "the R2 bridge must exist");
});

test("every street and shelter of the real graph points to existing nodes", () => {
  const ids = new Set(grafoManta.nodos.map((n) => n.id));
  for (const c of grafoManta.calles) assert.ok(ids.has(c.desde) && ids.has(c.hasta), c.id);
  for (const r of grafoManta.refugios) assert.ok(ids.has(r.nodo), r.id);
});

test("survivors can start in all four neighborhoods", () => {
  const barrios = new Set(grafoManta.nodos.map((n) => n.barrio).filter(Boolean));
  assert.deepEqual([...barrios].sort(), ["barbasquillo", "jocay", "los_esteros", "tarqui"]);
});

test("every node can reach a shelter", () => {
  const adyacencia = vecinos(grafoManta);
  const visitados = new Set(grafoManta.refugios.map((r) => r.nodo));
  const cola = [...visitados];
  while (cola.length) for (const v of adyacencia.get(cola.shift()!) ?? []) if (!visitados.has(v)) { visitados.add(v); cola.push(v); }
  assert.equal(visitados.size, grafoManta.nodos.length);
});
