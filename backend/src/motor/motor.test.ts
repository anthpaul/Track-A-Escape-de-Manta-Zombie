import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularSiguienteNodo, contextoGrafo } from "./motor";

const { indexado, refugios } = contextoGrafo;

test("with every shelter taken by a walker, the survivor escapes instead of waiting next to a zombie", () => {
  // Walkers stand on the four real shelters, so A* answers sin_ruta for everyone.
  const enRefugios = refugios.map((r, i) => ({ id: `Z-000${i + 1}`, tipo: "caminante" as const, nodo: r.nodo }));
  // A runner right next to the survivor: waiting means being bitten next turn.
  const nodoActual = refugios.map((r) => indexado.vecinos(r.nodo)).flat().find((n) => indexado.vecinos(n).length >= 3)!;
  const corredor = indexado.vecinos(nodoActual).find((n) => !refugios.some((r) => r.nodo === n))!;
  const mundo = { partidaId: "t", turno: 1, zombies: [...enRefugios, { id: "Z-0099", tipo: "corredor" as const, nodo: corredor }], aristasBloqueadas: [] };

  const { siguienteNodo, resultado } = calcularSiguienteNodo({ sobrevivienteId: "S-0001", nodoActual, mundo });
  assert.equal(resultado.tipo, "sin_ruta");
  assert.notEqual(siguienteNodo, nodoActual, "must move away from the runner");
  assert.ok(indexado.esMovimientoValido(nodoActual, siguienteNodo, []), "the escape is a legal street");
  assert.notEqual(siguienteNodo, corredor);
});

test("Pro capacity: with ULEAM full, a survivor at its door is sent to another shelter", () => {
  const uleam = contextoGrafo.refugios.find((r) => r.nombre.includes("ULEAM"))!;
  // N-0274 is ULEAM's only way in (one street from its node).
  const puerta = contextoGrafo.indexado.vecinos(uleam.nodo)[0]!;
  const dentro = Array.from({ length: uleam.capacidad }, (_, i) => ({
    id: `S-${String(i + 100).padStart(4, "0")}`,
    nodo: uleam.nodo,
    estado: "a_salvo" as const,
  }));
  const yo = { id: "S-0001", nodo: puerta, estado: "en_ruta" as const };
  const base = { partidaId: "p", turno: 5, zombies: [], aristasBloqueadas: [] };

  const libre = calcularSiguienteNodo({ sobrevivienteId: "S-0001", nodoActual: puerta, mundo: { ...base, sobrevivientes: [yo] } });
  assert.equal(libre.siguienteNodo, uleam.nodo, "with room, it walks in");

  const lleno = calcularSiguienteNodo({ sobrevivienteId: "S-0001", nodoActual: puerta, mundo: { ...base, sobrevivientes: [...dentro, yo] } });
  assert.notEqual(lleno.siguienteNodo, uleam.nodo, "full: it never walks into ULEAM");
  assert.equal(lleno.resultado.tipo, "movimiento");
  if (lleno.resultado.tipo === "movimiento") assert.notEqual(lleno.resultado.refugio, uleam.id);
});
