import { test } from "node:test";
import assert from "node:assert/strict";
import { nivelLatencia, resumenPanel } from "@/features/mapa/domain/resumen";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";

const grafo: Grafo = {
  version: "test",
  nodos: [],
  calles: [],
  refugios: [
    { id: "R-01", nodo: "N-0001", nombre: "Estadio Jocay", capacidad: 50 },
    { id: "R-02", nodo: "N-0002", nombre: "ULEAM", capacidad: 40 },
  ],
};

const snapshot = (p95ms: number | null): Snapshot => ({
  turno: 42,
  ronda: 2,
  zombies: [],
  aristasBloqueadas: ["C-0003"],
  sobrevivientes: [],
  refugios: [
    { id: "R-01", ocupacion: 10, capacidad: 50 },
    { id: "R-02", ocupacion: 40, capacidad: 40 },
  ],
  metricas: { vivos: 50, aSalvo: 20, mordidos: 10, p95ms },
  generadoEn: "2026-10-26T12:00:00.000Z",
});

test("p95 levels follow the official latency scoring tiers", () => {
  assert.deepEqual(nivelLatencia(120), { nivel: "excelente", puntos: 10 });
  assert.deepEqual(nivelLatencia(150), { nivel: "excelente", puntos: 10 });
  assert.deepEqual(nivelLatencia(151), { nivel: "bueno", puntos: 7 });
  assert.deepEqual(nivelLatencia(300), { nivel: "bueno", puntos: 7 });
  assert.deepEqual(nivelLatencia(500), { nivel: "limite", puntos: 4 });
  assert.deepEqual(nivelLatencia(501), { nivel: "fuera", puntos: 0 });
});

test("an unknown p95 is reported as no data, not as zero", () => {
  assert.deepEqual(nivelLatencia(null), { nivel: "sin_datos", puntos: null });
});

test("the summary carries round, turn, totals and survival rate", () => {
  const r = resumenPanel(grafo, snapshot(140));
  assert.equal(r.ronda, 2);
  assert.equal(r.turno, 42);
  assert.deepEqual(
    { enRuta: r.enRuta, aSalvo: r.aSalvo, mordidos: r.mordidos, total: r.total },
    { enRuta: 50, aSalvo: 20, mordidos: 10, total: 80 },
  );
  // Survival = everyone not bitten (on the road or safe) over the total.
  assert.equal(r.supervivenciaPct, 87);
  assert.equal(r.callesBloqueadas, 1);
});

test("shelters show their name, occupancy and whether they are full", () => {
  const r = resumenPanel(grafo, snapshot(140));
  assert.deepEqual(r.refugios, [
    { id: "R-01", nombre: "Estadio Jocay", ocupacion: 10, capacidad: 50, lleno: false },
    { id: "R-02", nombre: "ULEAM", ocupacion: 40, capacidad: 40, lleno: true },
  ]);
});

test("one bitten survivor out of many never shows as 100%", () => {
  const casi = { ...snapshot(null), metricas: { vivos: 299, aSalvo: 0, mordidos: 1, p95ms: null } };
  assert.equal(resumenPanel(grafo, casi).supervivenciaPct, 99);
});

test("survival rate is not lowered by floating point error", () => {
  const r = { ...snapshot(null), metricas: { vivos: 57, aSalvo: 0, mordidos: 43, p95ms: null } };
  assert.equal(resumenPanel(grafo, r).supervivenciaPct, 57);
});

test("an empty round reports 100% survival instead of dividing by zero", () => {
  const vacio = { ...snapshot(null), metricas: { vivos: 0, aSalvo: 0, mordidos: 0, p95ms: null } };
  assert.equal(resumenPanel(grafo, vacio).supervivenciaPct, 100);
});
