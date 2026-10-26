import { test } from "node:test";
import assert from "node:assert/strict";
import { avanzarTurno, crearSimulacion } from "./simulacion";
import { grafoMini } from "./grafo-mini";
import { vecinos } from "../vivo";

const AHORA = "2026-10-26T12:00:00.000Z";
const config = { sobrevivientes: 200, caminantes: 4, corredores: 2, hordas: 1, semilla: 42 };

test("the same seed produces the same rounds", () => {
  const a = avanzarTurno(grafoMini, crearSimulacion(grafoMini, config, AHORA), AHORA);
  const b = avanzarTurno(grafoMini, crearSimulacion(grafoMini, config, AHORA), AHORA);
  assert.deepEqual(a, b);
});

test("everyone only moves to a neighbor or stays, and never through a blocked street", () => {
  const adyacencia = vecinos(grafoMini);
  let snap = crearSimulacion(grafoMini, config, AHORA);
  for (let i = 0; i < 30; i++) {
    const siguiente = avanzarTurno(grafoMini, snap, AHORA);
    for (const s of siguiente.sobrevivientes) {
      const antes = snap.sobrevivientes.find((x) => x.id === s.id)!;
      if (antes.nodo === s.nodo) continue;
      assert.ok(adyacencia.get(antes.nodo)?.includes(s.nodo), `${s.id} jumped ${antes.nodo} → ${s.nodo}`);
      const calle = grafoMini.calles.find(
        (c) => (c.desde === antes.nodo && c.hasta === s.nodo) || (c.hasta === antes.nodo && c.desde === s.nodo),
      )!;
      assert.ok(!siguiente.aristasBloqueadas.includes(calle.id), `${s.id} crossed blocked ${calle.id}`);
    }
    snap = siguiente;
  }
});

test("a survivor on a shelter node is safe and stops moving", () => {
  let snap = crearSimulacion(grafoMini, config, AHORA);
  for (let i = 0; i < 30; i++) snap = avanzarTurno(grafoMini, snap, AHORA);
  const nodosRefugio = new Set(grafoMini.refugios.map((r) => r.nodo));
  for (const s of snap.sobrevivientes.filter((x) => x.estado === "a_salvo")) {
    assert.ok(nodosRefugio.has(s.nodo));
  }
  assert.ok(snap.metricas.aSalvo > 0, "nobody reached a shelter in 30 turns");
});

test("metrics always add up to the number of survivors", () => {
  let snap = crearSimulacion(grafoMini, config, AHORA);
  for (let i = 0; i < 15; i++) {
    snap = avanzarTurno(grafoMini, snap, AHORA);
    const { vivos, aSalvo, mordidos } = snap.metricas;
    assert.equal(vivos + aSalvo + mordidos, config.sobrevivientes);
  }
});

test("sleepers are never part of the published snapshot", () => {
  const snap = crearSimulacion(grafoMini, config, AHORA);
  assert.ok(snap.zombies.every((z) => z.tipo !== "dormido"));
});
