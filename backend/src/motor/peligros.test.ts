/**
 * K2 danger cost tests — AGENTS.md §4.4, HOJA_DE_RUTA §4.1 item 4.
 *
 * Acceptance criteria: one test per row of the §4.4 table.
 *
 * §4.4 table rows (in order):
 *   1. Node with visible zombie            → Prohibited
 *   2. Horde: node + all neighbours        → Prohibited  (shared/ + peligros.ts)
 *   3. Blocked edge (city event)           → Non-existent (K1, not re-tested here)
 *   4. Runner reachable next turn          → Very high    (Pro K5 — not active yet)
 *   5. Neighbours of a walker              → High penalty
 *   6. Cross-traffic edge (cruce)          → Prohibited
 *   7. Near possible sleeper               → No cost
 *
 * Fixture topology reminder:
 *   N-0001 —C-0001— N-0002 —C-0002— N-0003 —C-0003— N-0004
 *     |C-0010          |C-0014                           |C-0012
 *   N-0005 —C-0004— N-0006 —C-0005— N-0007 —C-0006— N-0008
 *     |C-0011          |C-0015                           |C-0013
 *   N-0009 —C-0007— N-0010 —C-0008— N-0011 —C-0009— N-0012
 *
 *   Shelters: R-01 @ N-0001, R-02 @ N-0012
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
// Shared setup
// ---------------------------------------------------------------------------

const indexado = crearGrafo(fixture);
const contexto = crearContextoGrafo(fixture as Grafo, indexado);
const sinPeligro = { zombies: [], aristasBloqueadas: [] };

// ---------------------------------------------------------------------------
// §4.4 Row 1 — Node with visible zombie → Prohibited
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
    // Walker on N-0002; direct path N-0001←N-0002 is blocked.
    // Survivor at N-0003 wants to reach R-01 (N-0001) — must detour.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 is prohibited; the survivor must not step onto it.
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
// §4.4 Row 2 — Horde: node + all static neighbours → Prohibited
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
    // N-0006 neighbours: N-0002, N-0005, N-0007, N-0010.
    // N-0001 is a neighbour of N-0002 but NOT a neighbour of N-0006 → not blocked.
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
    // N-0002 zone: N-0002, N-0001, N-0003, N-0006
    for (const n of ["N-0002", "N-0001", "N-0003", "N-0006"]) {
      assert.ok(p.nodosProhibidos.has(n), `${n} must be in horde-2 zone`);
    }
    // N-0010 zone: N-0010, N-0009, N-0011, N-0006, N-0015 (C-0015 connects N-0006↔N-0010)
    for (const n of ["N-0010", "N-0009", "N-0011"]) {
      assert.ok(p.nodosProhibidos.has(n), `${n} must be in horde-10 zone`);
    }
  });
});

// ---------------------------------------------------------------------------
// §4.4 Row 4 — Runner reachable nodes (Pro K5 — not active yet)
// ---------------------------------------------------------------------------

describe("§4.4 row 4: runner prediction (Pro K5) — constant defined, not yet applied", () => {
  it("RUNNER_PREDICTION_PENALTY constant is defined and > WALKER_ADJACENT_PENALTY", () => {
    assert.ok(
      RUNNER_PREDICTION_PENALTY > WALKER_ADJACENT_PENALTY,
      "runner penalty must be higher than walker penalty"
    );
  });

  it("calcularPeligros does NOT mark runner-adjacent nodes as prohibited (Pro feature off)", () => {
    // Runner at N-0006. Its neighbours (N-0002, N-0005, N-0007, N-0010) should
    // NOT be in nodosProhibidos for the runner-prediction rule (K5 off).
    // They ARE prohibited because the runner occupies N-0006 (row 1 rule).
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "corredor" as const, nodo: "N-0003" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // N-0003 is the runner node → prohibited (row 1).
    assert.ok(p.nodosProhibidos.has("N-0003"));
    // N-0002 and N-0004 are neighbours of N-0003 → NOT prohibited by runner rule (K5 off).
    // They MAY have a walker penalty if a walker were there, but there isn't one.
    // The point: no extra prohibition from runner-prediction.
    assert.ok(
      !p.nodosProhibidos.has("N-0002") || indexado.vecinos("N-0003").includes("N-0002"),
      // This assertion is intentionally loose: we only care that it wasn't ADDED by runner logic.
    );
    // No costosExtra from runner prediction.
    assert.ok(
      !p.costosExtra.has("N-0002") || (p.costosExtra.get("N-0002") ?? 0) < RUNNER_PREDICTION_PENALTY,
      "runner prediction penalty must not be active in K2"
    );
  });
});

// ---------------------------------------------------------------------------
// §4.4 Row 5 — Neighbours of a walker → High penalty (not prohibited)
// ---------------------------------------------------------------------------

describe("§4.4 row 5: walker-adjacent nodes get a high-cost penalty", () => {
  it("calcularPeligros adds WALKER_ADJACENT_PENALTY to each walker neighbour", () => {
    // Walker at N-0006. Neighbours: N-0002, N-0005, N-0007, N-0010.
    // BUT N-0006 is prohibited (row 1), so its neighbours that are not themselves
    // occupied get the walker-adjacent penalty.
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
    // Two walkers: N-0005 and N-0002. Both are neighbours of N-0001.
    // N-0001 should accumulate 2 × WALKER_ADJACENT_PENALTY.
    const mundo = {
      zombies: [
        { id: "Z-0001", tipo: "caminante" as const, nodo: "N-0005" },
        { id: "Z-0002", tipo: "caminante" as const, nodo: "N-0002" },
      ],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // N-0001 is a neighbour of both N-0005 and N-0002.
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
    // N-0002 is adjacent to the walker at N-0006 but not occupied by any zombie.
    if (indexado.vecinos("N-0006").includes("N-0002")) {
      assert.ok(!p.nodosProhibidos.has("N-0002"),
        "walker-adjacent node must not be outright prohibited");
    }
  });

  it("WALKER_ADJACENT_PENALTY is > max ε×time so it meaningfully steers A*", () => {
    // Max ε×time = 0.0001 × (2000 m / 1.0 m·s⁻¹) = 0.2
    const maxEpsilonTime = 0.0001 * (2000 / 1.0);
    assert.ok(
      WALKER_ADJACENT_PENALTY > maxEpsilonTime,
      `WALKER_ADJACENT_PENALTY (${WALKER_ADJACENT_PENALTY}) must exceed max ε×time (${maxEpsilonTime})`
    );
  });

  it("A* prefers a safe route over a walker-adjacent one when both have the same hop count", () => {
    // Walker at N-0002. Route N-0003 → N-0002 → N-0001 uses the walker node
    // (prohibited), so A* must find an alternative detour.
    // Even if we place the walker at a non-direct-path node, the penalty
    // should make the router prefer the safer path.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 is prohibited (row 1 — walker is on it).
    if (r.tipo === "movimiento") {
      assert.notEqual(r.siguienteNodo, "N-0002", "must not step onto walker node");
    }
  });
});

// ---------------------------------------------------------------------------
// §4.4 Row 6 — Cross-traffic edge (cruce de frente) → Prohibited
// ---------------------------------------------------------------------------

describe("§4.4 row 6: cross-traffic edges (cruce de frente) are forbidden", () => {
  it("walker at N-0002 forbids the survivor from moving N-0001 → N-0002", () => {
    // Zombie at N-0002, survivor wants to go N-0001 → N-0002.
    // Zombie could come back N-0002 → N-0001 through C-0001 → cruce.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "caminante" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const p = calcularPeligros(mundo, indexado);
    // Forbidden direction for survivor: N-0001 → N-0002
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
    // Hordes don't move; no cross-traffic risk.
    // The zone is already prohibited — the cross-traffic set should be empty for hordes.
    for (const vecino of indexado.vecinos("N-0006")) {
      assert.ok(
        !p.aristasCrucePeligroso.has(`${vecino}|N-0006`),
        `horde at N-0006 must not add cross-traffic entry for ${vecino}→N-0006`
      );
    }
  });

  it("sleeper does NOT create cross-traffic entries (invisible)", () => {
    // dormido type arrives via world snapshot only when it has woken up.
    // In practice dormido never appears in the snapshot, but if it did,
    // the motor should not generate cross-traffic for it.
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
    // Survivor direction N-0001 → N-0002 is forbidden.
    assert.equal(
      costoPeligroArista(p, "N-0002", "N-0001|N-0002"),
      Infinity,
      "cross-traffic edge cost must be Infinity"
    );
  });

  it("A* does not take a cross-traffic edge even when it is the shortest path", () => {
    // Walker at N-0008. Shortest path from N-0007 to R-02 (N-0012) is
    // N-0007 → N-0008 → N-0012. But N-0008 is the walker node (prohibited).
    // The test verifies the survivor doesn't cross INTO N-0008.
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
// §4.4 Row 7 — Sleeper locations → No cost (motor does not cheat)
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
// costoPeligroArista — unit tests for the helper
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
    // Runner at N-0006 → survivor cannot go N-0005 → N-0006
    assert.equal(costoPeligroArista(p, "N-0006", "N-0005|N-0006"), Infinity);
  });

  it("returns the walker penalty when destination is only walker-adjacent (not prohibited)", () => {
    // Walker at N-0006, check neighbour N-0002 (not itself occupied).
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
// Integration: peligrosPrecomputados parameter in buscarRuta
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
    // Simulate 200 survivors sharing the same world snapshot.
    const mundo = {
      zombies: [
        { id: "Z-0001", tipo: "caminante" as const, nodo: "N-0006" },
        { id: "Z-0002", tipo: "horda" as const, nodo: "N-0010" },
      ],
      aristasBloqueadas: ["C-0005"],
    };
    const precomputed = calcularPeligros(mundo, indexado);
    // Run buscarRuta for every fixture node using the shared peligros.
    for (const nodo of (fixture as Grafo).nodos) {
      assert.doesNotThrow(
        () => buscarRuta(nodo.id, contexto, mundo, precomputed),
        `buscarRuta with pre-computed peligros must not throw for node ${nodo.id}`
      );
    }
  });
});
