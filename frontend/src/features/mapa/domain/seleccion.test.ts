import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirSeguido } from "@/features/mapa/domain/seleccion";
import type { Sobreviviente } from "@/features/mapa/domain/tipos";

const s = (id: string, estado: Sobreviviente["estado"], nodo = "N-0001", siguienteNodo?: string): Sobreviviente =>
  ({ id, nodo, estado, siguienteNodo });

test("keeps following the current survivor while it is on the road", () => {
  assert.equal(elegirSeguido([s("S-0002", "en_ruta"), s("S-0005", "en_ruta")], "S-0005"), "S-0005");
});

test("switches to the lowest on-road id when the current one is safe or bitten", () => {
  const lista = [s("S-0009", "en_ruta"), s("S-0005", "a_salvo"), s("S-0003", "en_ruta")];
  assert.equal(elegirSeguido(lista, "S-0005"), "S-0003");
  assert.equal(elegirSeguido(lista, null), "S-0003");
});

test("follows nobody when nobody is on the road", () => {
  assert.equal(elegirSeguido([s("S-0001", "a_salvo"), s("S-0002", "mordido")], "S-0001"), null);
});

