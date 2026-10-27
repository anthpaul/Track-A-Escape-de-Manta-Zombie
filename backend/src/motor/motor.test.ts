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
