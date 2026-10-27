/**
 * Escape step when no shelter is reachable (AGENTS.md §4.3 rule 2).
 *
 * Fixture topology (shared/data/fixture-mini.json):
 *   N-0001 — N-0002 — N-0003 — N-0004
 *     |        |                  |
 *   N-0005 — N-0006 — N-0007 — N-0008
 *     |        |                  |
 *   N-0009 — N-0010 — N-0011 — N-0012
 *   Shelters: R-01 @ N-0001, R-02 @ N-0012
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearGrafo, type Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import { crearContextoGrafo } from "./astar";
import { calcularPeligros, costoPeligroArista } from "./peligros";
import { elegirEscape } from "./evasion";
import type { MundoTurno } from "./fuente-mundo";

const indexado = crearGrafo(fixture);
const contexto = crearContextoGrafo(fixture as Grafo, indexado);
type Mundo = Pick<MundoTurno, "zombies" | "aristasBloqueadas">;
const z = (id: number, tipo: "caminante" | "corredor" | "horda", nodo: string) => ({ id: `Z-${String(id).padStart(4, "0")}`, tipo, nodo });

function distancia(desde: string, mundo: Mundo): number {
  const origenes = mundo.zombies.filter((x) => x.tipo !== "horda").map((x) => x.nodo);
  const dist = new Map(origenes.map((n) => [n, 0]));
  const cola = [...origenes];
  for (let i = 0; i < cola.length; i++) {
    for (const v of indexado.vecinos(cola[i])) {
      if (dist.has(v) || !indexado.esMovimientoValido(cola[i], v, mundo.aristasBloqueadas)) continue;
      dist.set(v, dist.get(cola[i])! + 1);
      cola.push(v);
    }
  }
  return dist.get(desde) ?? Infinity;
}

describe("escape step when no shelter is reachable", () => {
  // Walkers sit on both shelters, so A* has no destination; a runner closes in from N-0005.
  const sinRefugio: Mundo = { zombies: [z(1, "caminante", "N-0001"), z(2, "caminante", "N-0012"), z(3, "corredor", "N-0005")], aristasBloqueadas: [] };

  it("moves to the legal neighbour farthest from every moving zombie", () => {
    const p = calcularPeligros(sinRefugio, indexado);
    const elegido = elegirEscape("N-0006", contexto, sinRefugio, p);
    assert.notEqual(elegido, "N-0006", "staying one street from the runner is the worst option");
    const candidatos = ["N-0006", ...indexado.vecinos("N-0006")].filter(
      (c) => !p.nodosProhibidos.has(c) && (c === "N-0006" || costoPeligroArista(p, c, `N-0006|${c}`) !== Infinity),
    );
    for (const c of candidatos) {
      assert.ok(distancia(elegido, sinRefugio) >= distancia(c, sinRefugio), `${elegido} must be at least as far as ${c}`);
    }
  });

  it("never steps onto a prohibited node or a forbidden crossing", () => {
    const p = calcularPeligros(sinRefugio, indexado);
    for (const nodo of fixture.nodos.map((n) => n.id)) {
      if (p.nodosProhibidos.has(nodo)) continue;
      const elegido = elegirEscape(nodo, contexto, sinRefugio, p);
      if (elegido === nodo) continue;
      assert.ok(indexado.esMovimientoValido(nodo, elegido, sinRefugio.aristasBloqueadas), `${nodo} → ${elegido} must be a legal street`);
      assert.equal(p.nodosProhibidos.has(elegido), false, `${nodo} → ${elegido} enters a prohibited node`);
      assert.notEqual(costoPeligroArista(p, elegido, `${nodo}|${elegido}`), Infinity, `${nodo} → ${elegido} is a forbidden crossing`);
    }
  });

  it("stays put when the current node is already the safest place", () => {
    // Zombies far east; N-0009 has neighbours N-0005 and N-0010, both closer to them.
    const lejos: Mundo = { zombies: [z(1, "caminante", "N-0001"), z(2, "caminante", "N-0012"), z(3, "corredor", "N-0008")], aristasBloqueadas: [] };
    const p = calcularPeligros(lejos, indexado);
    // N-0009 and N-0010 are both two streets from the nearest zombie; N-0005 is one. Ties keep the survivor in place.
    assert.equal(distancia("N-0009", lejos), distancia("N-0010", lejos));
    assert.equal(elegirEscape("N-0009", contexto, lejos, p), "N-0009");
  });

  it("stays put when every exit is blocked", () => {
    const encerrado: Mundo = { ...sinRefugio, aristasBloqueadas: ["C-0002", "C-0003"] };
    assert.equal(elegirEscape("N-0003", contexto, encerrado, calcularPeligros(encerrado, indexado)), "N-0003");
  });
});
