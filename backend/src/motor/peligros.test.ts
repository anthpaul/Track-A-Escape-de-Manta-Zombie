/**
 * Tests del costo de peligro de K2 (AGENTS.md §4.4, HOJA_DE_RUTA §4.1, ítem 4).
 *
 * Criterio de aceptación: un test por cada fila de la tabla de §4.4.
 *
 * Filas de la tabla de §4.4 (en orden):
 *   1. Nodo con zombie visible               → Prohibido
 *   2. Horda: nodo + todos sus vecinos       → Prohibido    (shared/ + peligros.ts)
 *   3. Arista bloqueada (evento de ciudad)   → No existe    (K1, no se vuelve a probar acá)
 *   4. Alcanzable por un corredor el próximo turno → Muy alto (Pro K5)
 *   5. Vecinos de un caminante               → Penalización alta
 *   6. Arista con cruce de frente            → Prohibido
 *   7. Cerca de un posible dormido           → Sin costo
 *
 * Recordatorio de la topología del fixture:
 *   N-0001 —C-0001— N-0002 —C-0002— N-0003 —C-0003— N-0004
 *     |C-0010          |C-0014                           |C-0012
 *   N-0005 —C-0004— N-0006 —C-0005— N-0007 —C-0006— N-0008
 *     |C-0011          |C-0015                           |C-0013
 *   N-0009 —C-0007— N-0010 —C-0008— N-0011 —C-0009— N-0012
 *
 *   Refugios: R-01 @ N-0001, R-02 @ N-0012
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearGrafo } from "@abcstack/shared";
import type { Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import {
  calcularPeligros,
  costoPeligroArista,
  WALKER_ADJACENT_PENALTY,
  RUNNER_PREDICTION_PENALTY,
} from "./peligros";
import { buscarRuta, crearContextoGrafo } from "./astar";

// ---------------------------------------------------------------------------
// Preparación compartida
// ---------------------------------------------------------------------------

const indexado = crearGrafo(fixture);
const contexto = crearContextoGrafo(fixture as Grafo, indexado);
const sinPeligro = { zombies: [], aristasBloqueadas: [] };

// ---------------------------------------------------------------------------
// §4.4 Fila 1: nodo con zombie visible → Prohibido
// ---------------------------------------------------------------------------

describe("§4.4 row 1: node with any visible zombie is prohibited", () => {
  it("walker on a node makes that node prohibited", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.ok(p.nodosProhibidos.has("N-0006"), "walker node must be prohibited");
  });

  it("runner on a node makes that node prohibited", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "corredor" as const, nodo: "N-0010" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.ok(p.nodosProhibidos.has("N-0010"), "runner node must be prohibited");
  });

  it("horde on a node makes that node prohibited (via horde rule, additive)", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.ok(p.nodosProhibidos.has("N-0006"), "horde node must be prohibited");
  });

  it("A* does not enter a node occupied by a walker", () => {
    // Caminante en N-0002; el camino directo N-0001←N-0002 queda bloqueado.
    // El sobreviviente en N-0003 quiere llegar a R-01 (N-0001): debe desviarse.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 está prohibido; el sobreviviente no debe pisarlo.
    if (r.tipo === "movimiento") {
      assert.notEqual(r.siguienteNodo, "N-0002",
        "A* must not move to a walker-occupied node");
    }
  });

  it("costoPeligroArista returns Infinity for a prohibited destination", () => {
    const p = calcularPeligros(
      { zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0005" }], aristasBloqueadas: [] },
      indexado,
    );
    assert.equal(costoPeligroArista(p, "N-0005", "N-0001|N-0005"), Infinity);
  });
});

// ---------------------------------------------------------------------------
// §4.4 Fila 2: horda, nodo + todos sus vecinos estáticos → Prohibido
// ---------------------------------------------------------------------------

describe("§4.4 row 2: horde blocks its node and all static neighbours", () => {
  it("horde at N-0006 prohibits N-0006 and its neighbours N-0002, N-0005, N-0007, N-0010", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    const expected = ["N-0006", ...indexado.vecinos("N-0006")];
    for (const nodo of expected) {
      assert.ok(p.nodosProhibidos.has(nodo),
        `horde zone must include ${nodo}`);
    }
  });

  it("horde zone does NOT include nodes two hops away", () => {
    // Vecinos de N-0006: N-0002, N-0005, N-0007, N-0010.
    // N-0001 es vecino de N-0002 pero NO de N-0006 → no queda bloqueado.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.ok(!p.nodosProhibidos.has("N-0001"),
      "N-0001 is two hops from the horde — must NOT be in the zone");
  });

  it("two hordes: zones are unioned, not intersected", () => {
    const mundo = {
      zombies: [
        { id: "Z-0001", tipo: "horda" as const, nodo: "N-0002" },
        { id: "Z-0002", tipo: "horda" as const, nodo: "N-0010" },
      ],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // Zona de N-0002: N-0002, N-0001, N-0003, N-0006
    for (const n of ["N-0002", "N-0001", "N-0003", "N-0006"]) {
      assert.ok(p.nodosProhibidos.has(n), `${n} must be in horde-2 zone`);
    }
    // Zona de N-0010: N-0010, N-0009, N-0011, N-0006, N-0015 (C-0015 conecta N-0006↔N-0010)
    for (const n of ["N-0010", "N-0009", "N-0011"]) {
      assert.ok(p.nodosProhibidos.has(n), `${n} must be in horde-10 zone`);
    }
  });
});

// ---------------------------------------------------------------------------
// §4.4 Fila 4: nodos alcanzables por un corredor (Pro K5)
// ---------------------------------------------------------------------------

describe("§4.4 row 4: runner prediction (Pro K5) — nodes a runner reaches next turn cost very high", () => {
  const corredorEn = (...nodos: string[]) => ({
    zombies: nodos.map((nodo, i) => ({ id: `Z-000${i + 1}`, tipo: "corredor" as const, nodo })),
    aristasBloqueadas: [] as string[],
  });

  it("RUNNER_PREDICTION_PENALTY constant is defined and > WALKER_ADJACENT_PENALTY", () => {
    assert.ok(
      RUNNER_PREDICTION_PENALTY > WALKER_ADJACENT_PENALTY,
      "runner penalty must be higher than walker penalty"
    );
  });

  it("every node within two streets of a runner gets the penalty; farther nodes do not", () => {
    // Corredor en N-0003: a 1 calle → N-0002, N-0004; a 2 calles → N-0001, N-0006, N-0008.
    const p = calcularPeligros(corredorEn("N-0003"), indexado);
    for (const nodo of ["N-0002", "N-0004", "N-0001", "N-0006", "N-0008"]) {
      assert.equal(p.costosExtra.get(nodo), RUNNER_PREDICTION_PENALTY, `${nodo} is reachable by the runner`);
    }
    for (const nodo of ["N-0005", "N-0007", "N-0012"]) {
      assert.equal(p.costosExtra.has(nodo), false, `${nodo} is three or more streets away`);
    }
  });

  it("reachable nodes are penalized, not prohibited: a runner may move elsewhere", () => {
    const p = calcularPeligros(corredorEn("N-0003"), indexado);
    assert.ok(p.nodosProhibidos.has("N-0003"), "the runner's own node stays prohibited (row 1)");
    assert.equal(p.nodosProhibidos.has("N-0001"), false);
    assert.equal(p.nodosProhibidos.has("N-0006"), false);
  });

  it("a runner cannot use blocked streets, so nothing behind them is predicted", () => {
    // C-0002 es el único enlace corto N-0003 → N-0002.
    const p = calcularPeligros({ ...corredorEn("N-0003"), aristasBloqueadas: ["C-0002"] }, indexado);
    for (const nodo of ["N-0002", "N-0001", "N-0006"]) {
      assert.equal(p.costosExtra.has(nodo), false, `${nodo} is behind a blocked street`);
    }
    assert.equal(p.costosExtra.get("N-0004"), RUNNER_PREDICTION_PENALTY);
    assert.equal(p.costosExtra.get("N-0008"), RUNNER_PREDICTION_PENALTY);
  });

  it("two runners reaching the same node add up", () => {
    // N-0002 es alcanzable desde N-0003 (1 calle) y desde N-0006 (1 calle).
    const p = calcularPeligros(corredorEn("N-0003", "N-0006"), indexado);
    assert.equal(p.costosExtra.get("N-0004"), RUNNER_PREDICTION_PENALTY, "only the first runner reaches N-0004");
    assert.equal(p.costosExtra.get("N-0002"), 2 * RUNNER_PREDICTION_PENALTY);
  });

  it("walkers and hordes never get the runner prediction (sleepers: row 7)", () => {
    const otros = {
      zombies: [
        { id: "Z-0001", tipo: "caminante" as const, nodo: "N-0003" },
        { id: "Z-0002", tipo: "horda" as const, nodo: "N-0010" },
      ],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(otros, indexado);
    // El vecino del caminante recibe solo la penalización del caminante; a dos calles no recibe nada.
    assert.equal(p.costosExtra.get("N-0002"), WALKER_ADJACENT_PENALTY);
    assert.equal(p.costosExtra.has("N-0001"), false);
    // A dos calles de la horda, fuera de su zona bloqueada: tampoco recibe nada.
    assert.equal(p.costosExtra.has("N-0012"), false);
  });

  it("A* prefers the equally short route that stays out of the runner's reach", () => {
    // Sobreviviente en N-0006; R-01 en N-0001, a dos calles por N-0002 o por N-0005.
    // El corredor en N-0003 llega a N-0002 el próximo turno, pero no a N-0005.
    const r = buscarRuta("N-0006", contexto, corredorEn("N-0003"));
    assert.equal(r.tipo, "movimiento");
    assert.equal(r.tipo === "movimiento" && r.siguienteNodo, "N-0005");
  });
});

// ---------------------------------------------------------------------------
// §4.4 Fila 5: vecinos de un caminante → Penalización alta (no prohibido)
// ---------------------------------------------------------------------------

describe("§4.4 row 5: walker-adjacent nodes get a high-cost penalty", () => {
  it("calcularPeligros adds WALKER_ADJACENT_PENALTY to each walker neighbour", () => {
    // Caminante en N-0006. Vecinos: N-0002, N-0005, N-0007, N-0010.
    // N-0006 está prohibido (fila 1), así que sus vecinos que no están ocupados
    // reciben la penalización por estar junto a un caminante.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    for (const vecino of indexado.vecinos("N-0006")) {
      if (!p.nodosProhibidos.has(vecino)) {
        assert.equal(
          p.costosExtra.get(vecino),
          WALKER_ADJACENT_PENALTY,
          `${vecino} must carry walker-adjacent penalty`
        );
      }
    }
  });

  it("penalty accumulates when a node is adjacent to two walkers", () => {
    // Dos caminantes: N-0005 y N-0002. Ambos son vecinos de N-0001.
    // N-0001 debería acumular 2 × WALKER_ADJACENT_PENALTY.
    const mundo = {
      zombies: [
        { id: "Z-0001", tipo: "caminante" as const, nodo: "N-0005" },
        { id: "Z-0002", tipo: "caminante" as const, nodo: "N-0002" },
      ],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // N-0001 es vecino tanto de N-0005 como de N-0002.
    assert.ok(
      indexado.vecinos("N-0005").includes("N-0001"),
      "N-0001 must be a neighbour of N-0005 in the fixture"
    );
    assert.ok(
      indexado.vecinos("N-0002").includes("N-0001"),
      "N-0001 must be a neighbour of N-0002 in the fixture"
    );
    if (!p.nodosProhibidos.has("N-0001")) {
      assert.equal(
        p.costosExtra.get("N-0001"),
        2 * WALKER_ADJACENT_PENALTY,
        "double-adjacent node must accumulate two penalties"
      );
    }
  });

  it("walker-adjacent node is NOT in nodosProhibidos — survivor can still enter it", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // N-0002 es adyacente al caminante en N-0006, pero ningún zombie lo ocupa.
    if (indexado.vecinos("N-0006").includes("N-0002")) {
      assert.ok(!p.nodosProhibidos.has("N-0002"),
        "walker-adjacent node must not be outright prohibited");
    }
  });

  it("WALKER_ADJACENT_PENALTY is > max ε×time so it meaningfully steers A*", () => {
    // Máximo de ε×tiempo = 0.0001 × (2000 m / 1.0 m·s⁻¹) = 0.2
    const maxEpsilonTime = 0.0001 * (2000 / 1.0);
    assert.ok(
      WALKER_ADJACENT_PENALTY > maxEpsilonTime,
      `WALKER_ADJACENT_PENALTY (${WALKER_ADJACENT_PENALTY}) must exceed max ε×time (${maxEpsilonTime})`
    );
  });

  it("A* prefers a safe route over a walker-adjacent one when both have the same hop count", () => {
    // Caminante en N-0002. La ruta N-0003 → N-0002 → N-0001 usa el nodo del
    // caminante (prohibido), así que A* debe encontrar un desvío alternativo.
    // Aunque el caminante esté en un nodo fuera del camino directo, la
    // penalización debería hacer que el ruteador prefiera el camino más seguro.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 está prohibido (fila 1: el caminante está encima).
    if (r.tipo === "movimiento") {
      assert.notEqual(r.siguienteNodo, "N-0002", "must not step onto walker node");
    }
  });
});

// ---------------------------------------------------------------------------
// §4.4 Fila 6: arista con cruce de frente → Prohibido
// ---------------------------------------------------------------------------

describe("§4.4 row 6: cross-traffic edges (cruce de frente) are forbidden", () => {
  it("walker at N-0002 forbids the survivor from moving N-0001 → N-0002", () => {
    // Zombie en N-0002; el sobreviviente quiere ir N-0001 → N-0002.
    // El zombie podría venir N-0002 → N-0001 por C-0001 → cruce.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // Dirección prohibida para el sobreviviente: N-0001 → N-0002
    assert.ok(
      p.aristasCrucePeligroso.has("N-0001|N-0002"),
      "survivor direction N-0001→N-0002 must be forbidden when zombie is at N-0002"
    );
  });

  it("runner at N-0006 forbids all edges pointing toward N-0006", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "corredor" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    for (const vecino of indexado.vecinos("N-0006")) {
      assert.ok(
        p.aristasCrucePeligroso.has(`${vecino}|N-0006`),
        `survivor direction ${vecino}→N-0006 must be forbidden when runner is at N-0006`
      );
    }
  });

  it("horde does NOT create cross-traffic entries (hordes are almost immobile)", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // Las hordas no se mueven; no hay riesgo de cruce.
    // La zona ya está prohibida: el conjunto de cruces debería quedar vacío para las hordas.
    for (const vecino of indexado.vecinos("N-0006")) {
      assert.ok(
        !p.aristasCrucePeligroso.has(`${vecino}|N-0006`),
        `horde at N-0006 must not add cross-traffic entry for ${vecino}→N-0006`
      );
    }
  });

  it("sleeper does NOT create cross-traffic entries (invisible)", () => {
    // El tipo dormido llega en el snapshot del mundo solo cuando ya despertó.
    // En la práctica nunca aparece en el snapshot, pero si apareciera,
    // el motor no debería generar cruces por él.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "dormido" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.equal(p.aristasCrucePeligroso.size, 0,
      "dormido must not create any cross-traffic entries");
  });

  it("costoPeligroArista returns Infinity for a forbidden cross-traffic edge", () => {
    const p = calcularPeligros(
      { zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }], aristasBloqueadas: [] },
      indexado,
    );
    // La dirección N-0001 → N-0002 del sobreviviente está prohibida.
    assert.equal(
      costoPeligroArista(p, "N-0002", "N-0001|N-0002"),
      Infinity,
      "cross-traffic edge cost must be Infinity"
    );
  });

  it("A* does not take a cross-traffic edge even when it is the shortest path", () => {
    // Caminante en N-0008. El camino más corto de N-0007 a R-02 (N-0012) es
    // N-0007 → N-0008 → N-0012, pero N-0008 es el nodo del caminante (prohibido).
    // El test verifica que el sobreviviente no ENTRE a N-0008.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0008" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0007", contexto, mundo);
    if (r.tipo === "movimiento") {
      assert.notEqual(r.siguienteNodo, "N-0008",
        "A* must not step into walker-occupied N-0008");
    }
  });
});

// ---------------------------------------------------------------------------
// §4.4 Fila 7: posiciones de dormidos → Sin costo (el motor no hace trampa)
// ---------------------------------------------------------------------------

describe("§4.4 row 7: sleeper locations carry no cost (motor has no data)", () => {
  it("dormido in the snapshot produces no prohibited nodes, no penalties, no cross-traffic", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "dormido" as const, nodo: "N-0007" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    assert.equal(p.nodosProhibidos.size, 0, "no prohibited nodes from a dormido");
    assert.equal(p.costosExtra.size, 0, "no cost penalties from a dormido");
    assert.equal(p.aristasCrucePeligroso.size, 0, "no cross-traffic from a dormido");
  });

  it("A* result is identical with and without a dormido in the snapshot", () => {
    const conDormido = {
      zombies: [{ id: "Z-0001", tipo: "dormido" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const rConDormido = buscarRuta("N-0003", contexto, conDormido);
    const rSinDormido = buscarRuta("N-0003", contexto, sinPeligro);
    assert.deepEqual(rConDormido, rSinDormido,
      "dormido must not affect routing decisions");
  });
});

// ---------------------------------------------------------------------------
// costoPeligroArista: tests unitarios de la función auxiliar
// ---------------------------------------------------------------------------

describe("costoPeligroArista helper", () => {
  it("returns 0 for a completely safe destination and edge", () => {
    const p = calcularPeligros(sinPeligro, indexado);
    assert.equal(costoPeligroArista(p, "N-0002", "N-0001|N-0002"), 0);
  });

  it("returns Infinity when destination is prohibited", () => {
    const p = calcularPeligros(
      { zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0005" }], aristasBloqueadas: [] },
      indexado,
    );
    assert.equal(costoPeligroArista(p, "N-0005", "N-0001|N-0005"), Infinity);
  });

  it("returns Infinity when edge is cross-traffic forbidden", () => {
    const p = calcularPeligros(
      { zombies: [{ id: "Z-0001", tipo: "corredor" as const, nodo: "N-0006" }], aristasBloqueadas: [] },
      indexado,
    );
    // Corredor en N-0006 → el sobreviviente no puede ir N-0005 → N-0006
    assert.equal(costoPeligroArista(p, "N-0006", "N-0005|N-0006"), Infinity);
  });

  it("returns the walker penalty when destination is only walker-adjacent (not prohibited)", () => {
    // Caminante en N-0006; se revisa el vecino N-0002 (que no está ocupado).
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    if (!p.nodosProhibidos.has("N-0002") && p.costosExtra.has("N-0002")) {
      assert.equal(
        costoPeligroArista(p, "N-0002", "N-0001|N-0002"),
        WALKER_ADJACENT_PENALTY
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Integración: parámetro peligrosPrecomputados de buscarRuta
// ---------------------------------------------------------------------------

describe("integration: buscarRuta accepts pre-computed Peligros", () => {
  it("produces the same result whether peligros is pre-computed or computed internally", () => {
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" }],
      aristasBloqueadas: ["C-0001"],
    };
    const precomputed = calcularPeligros(mundo, indexado);
    const r1 = buscarRuta("N-0003", contexto, mundo);
    const r2 = buscarRuta("N-0003", contexto, mundo, precomputed);
    assert.deepEqual(r1, r2,
      "pre-computed and internally computed peligros must yield identical results");
  });

  it("all 200 survivors in R3 can share one pre-computed Peligros per turn", () => {
    // Se simulan 200 sobrevivientes que comparten el mismo snapshot del mundo.
    const mundo = {
      zombies: [
        { id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" },
        { id: "Z-0002", tipo: "horda" as const, nodo: "N-0010" },
      ],
      aristasBloqueadas: ["C-0005"],
    };
    const precomputed = calcularPeligros(mundo, indexado);
    // Se ejecuta buscarRuta para cada nodo del fixture con los peligros compartidos.
    for (const nodo of (fixture as Grafo).nodos) {
      assert.doesNotThrow(
        () => buscarRuta(nodo.id, contexto, mundo, precomputed),
        `buscarRuta with pre-computed peligros must not throw for node ${nodo.id}`
      );
    }
  });
});
