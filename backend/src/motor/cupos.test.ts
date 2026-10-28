/**
 * Capacidad de refugios (Pro): un reparto determinista de cupos por turno, compartido por todas las llamadas a /paso.
 *
 * Fixture (fixture-mini.json): R-01 @ N-0001, R-02 @ N-0012, acá con capacidad 2 cada uno.
 *   N-0001 — N-0002 — N-0003 — N-0004
 *     |        |                  |
 *   N-0005 — N-0006 — N-0007 — N-0008
 *     |        |                  |
 *   N-0009 — N-0010 — N-0011 — N-0012
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { crearGrafo, type Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import { crearContextoGrafo } from "./astar";
import { asignarCupos } from "./cupos";

const conCapacidad = (capacidad: number): Grafo => ({ ...(fixture as Grafo), refugios: (fixture as Grafo).refugios.map((r) => ({ ...r, capacidad })) });
const contexto = (capacidad: number) => {
  const g = conCapacidad(capacidad);
  return crearContextoGrafo(g, crearGrafo(g));
};
const mundo = (sobrevivientes?: { id: string; nodo: string; estado: "en_ruta" | "a_salvo" | "mordido" }[], aristasBloqueadas: string[] = []) =>
  ({ partidaId: "p", turno: 1, zombies: [], aristasBloqueadas, sobrevivientes });

test("without survivors in the world there is nothing to allocate: no restriction, as before", () => {
  assert.equal(asignarCupos(contexto(2), mundo()), null);
});

test("each survivor gets the closest shelter that still has room; whoever is inside takes a place", () => {
  const cupos = asignarCupos(contexto(2), mundo([
    { id: "S-0001", nodo: "N-0001", estado: "a_salvo" }, // dentro de R-01: ahí queda 1 lugar
    { id: "S-0002", nodo: "N-0002", estado: "en_ruta" }, // a 1 calle de R-01 y a 4 de R-02
    { id: "S-0005", nodo: "N-0005", estado: "en_ruta" }, // a 1 calle de R-01 y a 4 de R-02
    { id: "S-0006", nodo: "N-0006", estado: "en_ruta" }, // a 2 calles de R-01 y a 3 de R-02
    { id: "S-0009", nodo: "N-0009", estado: "mordido" }, // fuera de la ronda: no ocupa nada
  ]))!;
  // Los empates a igual distancia se resuelven por id: S-0002 toma el último lugar de R-01, así que S-0005 va a R-02.
  assert.deepEqual([...cupos.refugiosPara("S-0002")!], ["R-01"]);
  assert.deepEqual([...cupos.refugiosPara("S-0005")!], ["R-02"]);
  assert.deepEqual([...cupos.refugiosPara("S-0006")!], ["R-02"]);
  assert.deepEqual([...cupos.conLugar].sort(), ["R-01", "R-02"]);
});

test("places nobody claimed stay open to everyone as a second choice", () => {
  const cupos = asignarCupos(contexto(2), mundo([{ id: "S-0002", nodo: "N-0002", estado: "en_ruta" }]))!;
  assert.deepEqual([...cupos.refugiosPara("S-0002")!].sort(), ["R-01", "R-02"]);
});

test("with more people than places, those left without one are not restricted", () => {
  const cupos = asignarCupos(contexto(1), mundo([
    { id: "S-0002", nodo: "N-0002", estado: "en_ruta" },
    { id: "S-0005", nodo: "N-0005", estado: "en_ruta" },
    { id: "S-0006", nodo: "N-0006", estado: "en_ruta" },
  ]))!;
  assert.deepEqual([...cupos.refugiosPara("S-0002")!], ["R-01"]);
  assert.deepEqual([...cupos.refugiosPara("S-0006")!], ["R-02"]);
  assert.equal(cupos.refugiosPara("S-0005"), undefined);
});

test("a full shelter is never offered, and distances skip closed streets", () => {
  // R-01 está lleno; cerrar N-0006 → N-0010 aleja R-02 para S-0006, pero es el único que queda.
  const cupos = asignarCupos(contexto(1), mundo([
    { id: "S-0001", nodo: "N-0001", estado: "a_salvo" },
    { id: "S-0006", nodo: "N-0006", estado: "en_ruta" },
  ], ["C-0015"]))!;
  assert.deepEqual([...cupos.conLugar], ["R-02"]);
  assert.deepEqual([...cupos.refugiosPara("S-0006")!], ["R-02"]);
});
