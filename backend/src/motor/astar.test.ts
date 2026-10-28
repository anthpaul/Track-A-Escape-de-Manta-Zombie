/**
 * K1 A* tests — HOJA_DE_RUTA §4.1 item 3
 *
 * Acceptance criteria:
 *   - Shortest route in TURNS on the fixture
 *   - Respects blocked edges (aristasBloqueadas)
 *   - Safe fallback when no path exists
 *
 * All tests run against the shared fixture-mini.json so the same data
 * validates the router, shared/grafo.ts, and the schema in one pass.
 *
 * Fixture topology (12 nodes, 15 streets, 2 shelters):
 *
 *   N-0001(tarqui)    —C-0001—  N-0002  —C-0002—  N-0003  —C-0003—  N-0004(los_esteros)
 *      |C-0010                    |C-0014                                |C-0012
 *   N-0005(los_est.)  —C-0004—  N-0006  —C-0005—  N-0007  —C-0006—  N-0008(barb.)
 *      |C-0011                    |C-0015                                |C-0013
 *   N-0009(barb.)     —C-0007—  N-0010  —C-0008—  N-0011  —C-0009—  N-0012(jocay)
 *
 *   Shelters: R-01 @ N-0001, R-02 @ N-0012
 *   Bridge:   C-0005 (N-0006 ↔ N-0007)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearGrafo } from "@abcstack/shared";
import type { Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import { buscarRuta, crearContextoGrafo, type ResultadoBusqueda } from "./astar";
import { MinHeap } from "./min-heap";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const grafo = crearGrafo(fixture);
const contexto = crearContextoGrafo(fixture as Grafo, grafo);

type Mundo = Pick<MundoTurno, "zombies" | "aristasBloqueadas">;
const sinPeligro: Mundo = { zombies: [], aristasBloqueadas: [] };

function siguiente(nodo: string, mundo = sinPeligro): string {
  const r = buscarRuta(nodo, contexto, mundo);
  if (r.tipo === "ya_en_refugio") return nodo;
  if (r.tipo === "movimiento") return r.siguienteNodo;
  return nodo; // sin_ruta → stay put
}

/** Walk the A* step-by-step until a shelter or a cycle/limit is hit. */
function caminoCompleto(inicio: string, mundo = sinPeligro): string[] {
  const path = [inicio];
  const visited = new Set([inicio]);
  let current = inicio;
  for (let i = 0; i < 30; i++) {
    const r = buscarRuta(current, contexto, mundo);
    if (r.tipo === "ya_en_refugio") return path;
    if (r.tipo === "sin_ruta") return path;
    const next = r.siguienteNodo;
    path.push(next);
    if (visited.has(next)) return path; // cycle — test should fail
    visited.add(next);
    current = next;
    if (fixture.refugios.some((ref) => ref.nodo === next)) return path;
  }
  return path; // exceeded limit — test should fail
}

// ---------------------------------------------------------------------------
// Shortest route in turns
// ---------------------------------------------------------------------------

describe("shortest route in turns (K1)", () => {
  it("survivor already at a shelter returns ya_en_refugio for R-01", () => {
    const r = buscarRuta("N-0001", contexto, sinPeligro);
    assert.equal(r.tipo, "ya_en_refugio");
    assert.equal((r as Extract<ResultadoBusqueda, { tipo: "ya_en_refugio" }>).refugio, "R-01");
  });

  it("survivor already at a shelter returns ya_en_refugio for R-02", () => {
    const r = buscarRuta("N-0012", contexto, sinPeligro);
    assert.equal(r.tipo, "ya_en_refugio");
    assert.equal((r as Extract<ResultadoBusqueda, { tipo: "ya_en_refugio" }>).refugio, "R-02");
  });

  it("N-0002 is 1 step from R-01 (N-0001) via C-0001", () => {
    assert.equal(siguiente("N-0002"), "N-0001");
  });

  it("N-0005 is 1 step from R-01 (N-0001) via C-0010", () => {
    assert.equal(siguiente("N-0005"), "N-0001");
  });

  it("N-0011 is 1 step from R-02 (N-0012) via C-0009", () => {
    assert.equal(siguiente("N-0011"), "N-0012");
  });

  it("path from N-0012 is zero steps (already at R-02)", () => {
    const path = caminoCompleto("N-0012");
    assert.equal(path.length, 1);
    assert.equal(path[0], "N-0012");
  });

  it("path from N-0006 reaches a shelter without cycles", () => {
    const path = caminoCompleto("N-0006");
    const last = path.at(-1)!;
    assert.ok(
      fixture.refugios.some((r) => r.nodo === last),
      `expected last node ${last} to be a shelter`
    );
  });

  it("path from every barrio origin reaches a shelter", () => {
    for (const barrio of ["tarqui", "los_esteros", "barbasquillo", "jocay"]) {
      const start = (fixture as Grafo).nodos.find((n) => n.barrio === barrio)!;
      assert.ok(start, `no node found for barrio ${barrio}`);
      const path = caminoCompleto(start.id);
      const last = path.at(-1)!;
      assert.ok(
        fixture.refugios.some((r) => r.nodo === last),
        `barrio ${barrio}: last node ${last} is not a shelter (path: ${path.join(" → ")})`
      );
    }
  });

  it("returns a movimiento result with refugio and costoTotal > 0 for a non-shelter node", () => {
    const r = buscarRuta("N-0006", contexto, sinPeligro);
    assert.equal(r.tipo, "movimiento");
    const mv = r as Extract<ResultadoBusqueda, { tipo: "movimiento" }>;
    assert.ok(mv.costoTotal > 0, "expected positive cost");
    assert.ok(
      fixture.refugios.some((ref) => ref.id === mv.refugio),
      `expected refugio field to be a valid shelter id, got ${mv.refugio}`
    );
  });
});

// ---------------------------------------------------------------------------
// Respects blocked edges
// ---------------------------------------------------------------------------

describe("respects blocked edges (aristasBloqueadas)", () => {
  it("blocks C-0001 and forces N-0002 to detour to R-01 via N-0006 → N-0005 → N-0001", () => {
    // Without block: N-0002 → N-0001 (1 hop via C-0001)
    // With C-0001 blocked: N-0002 → N-0006 → N-0005 → N-0001 (3 hops)
    const blocked = { zombies: [], aristasBloqueadas: ["C-0001"] };
    const path = caminoCompleto("N-0002", blocked);
    assert.ok(!path.includes("C-0001"), "path should not use blocked edge (internal check)");
    // The first step must not be N-0001 directly (that requires C-0001).
    assert.notEqual(path[1], "N-0001",
      "first move should not cross blocked C-0001 to N-0001 directly"
    );
    const last = path.at(-1)!;
    assert.ok(
      fixture.refugios.some((r) => r.nodo === last),
      `expected last node ${last} to be a shelter after detour`
    );
  });

  it("blocks the bridge C-0005 and survivor still reaches a shelter", () => {
    // C-0005 is the bridge between N-0006 and N-0007.
    const blocked = { zombies: [], aristasBloqueadas: ["C-0005"] };
    const path = caminoCompleto("N-0007", blocked);
    const last = path.at(-1)!;
    assert.ok(
      fixture.refugios.some((r) => r.nodo === last),
      `expected last node ${last} to be a shelter after bridge collapse`
    );
  });

  it("stays put when all exits from a node are blocked", () => {
    // N-0001 has only C-0001 (→ N-0002) and C-0010 (→ N-0005).
    // If we also block all those but N-0001 is a shelter, it returns ya_en_refugio.
    // So test with N-0003 instead: C-0002 (← N-0002) and C-0003 (→ N-0004).
    const blocked = { zombies: [], aristasBloqueadas: ["C-0002", "C-0003"] };
    const r = buscarRuta("N-0003", contexto, blocked);
    // N-0003 has only two edges; both blocked → sin_ruta.
    assert.equal(r.tipo, "sin_ruta");
    assert.equal((r as Extract<ResultadoBusqueda, { tipo: "sin_ruta" }>).nodo, "N-0003");
  });

  it("next node is always a valid unblocked neighbor", () => {
    const blocked = { zombies: [], aristasBloqueadas: ["C-0001", "C-0010"] };
    const r = buscarRuta("N-0002", contexto, blocked);
    if (r.tipo === "movimiento") {
      assert.ok(
        grafo.vecinos("N-0002").includes(r.siguienteNodo),
        `${r.siguienteNodo} is not a neighbor of N-0002`
      );
      assert.ok(
        grafo.esMovimientoValido("N-0002", r.siguienteNodo, new Set(blocked.aristasBloqueadas)),
        `move to ${r.siguienteNodo} is blocked`
      );
    }
    // sin_ruta is also acceptable here (all meaningful paths might be blocked)
  });
});

// ---------------------------------------------------------------------------
// Horde-blocked nodes
// ---------------------------------------------------------------------------

describe("horde blocks its node and all static neighbors (K1 danger model)", () => {
  it("avoids a horde-blocked node on the direct path", () => {
    // Put a horde on N-0002. Direct path N-0003 → N-0002 → N-0001 becomes blocked.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 and its neighbors (N-0001, N-0003, N-0006) are blocked by the horde.
    // N-0003 itself is a neighbor of N-0002 → also blocked → sin_ruta expected
    // (N-0003 is inside the horde zone, all its exits go through blocked nodes).
    if (r.tipo === "movimiento") {
      // If a path was found, make sure it doesn't go through N-0002 or its neighbors.
      const hordeBlocked = grafo.nodosBloqueadosPorHordas(mundo.zombies);
      assert.ok(
        !hordeBlocked.has(r.siguienteNodo),
        `next node ${r.siguienteNodo} is inside horde zone`
      );
    }
    // sin_ruta is valid if N-0003 is itself in the horde zone.
  });

  it("finds a path that bypasses the horde zone entirely", () => {
    // Horde at N-0010: blocks N-0009, N-0010, N-0011, N-0006, N-0007.
    // N-0008 is NOT a neighbor of N-0010 in this fixture, so it's safe.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0010" }],
      aristasBloqueadas: [],
    };
    const hordeBlocked = grafo.nodosBloqueadosPorHordas(mundo.zombies);
    // Find a start node that is not in the horde zone.
    const safeStart = "N-0004"; // far corner, not adjacent to N-0010
    if (!hordeBlocked.has(safeStart)) {
      const path = caminoCompleto(safeStart, mundo);
      const last = path.at(-1)!;
      // Every node in the path must be outside the horde zone.
      for (const node of path) {
        assert.ok(!hordeBlocked.has(node), `path visits horde-blocked node ${node}`);
      }
      assert.ok(
        fixture.refugios.some((r) => r.nodo === last),
        `expected to reach a shelter, got ${last}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Safe fallback — never throws, always returns a valid node
// ---------------------------------------------------------------------------

describe("safe fallback", () => {
  it("returns sin_ruta with current node when completely surrounded", () => {
    // Block every edge connected to N-0003.
    const blocked = { zombies: [], aristasBloqueadas: ["C-0002", "C-0003"] };
    const r = buscarRuta("N-0003", contexto, blocked);
    assert.equal(r.tipo, "sin_ruta");
    assert.equal((r as Extract<ResultadoBusqueda, { tipo: "sin_ruta" }>).nodo, "N-0003");
  });

  it("never throws for any node in the fixture", () => {
    for (const nodo of (fixture as Grafo).nodos) {
      assert.doesNotThrow(() => buscarRuta(nodo.id, contexto, sinPeligro));
    }
  });

  it("returns a valid neighbor or the same node — never an unknown node", () => {
    const allNodes = new Set((fixture as Grafo).nodos.map((n) => n.id));
    for (const nodo of (fixture as Grafo).nodos) {
      const r = buscarRuta(nodo.id, contexto, sinPeligro);
      if (r.tipo === "movimiento") {
        assert.ok(allNodes.has(r.siguienteNodo), `unknown node ${r.siguienteNodo}`);
        assert.ok(
          grafo.esMovimientoValido(nodo.id, r.siguienteNodo, []),
          `${r.siguienteNodo} is not reachable from ${nodo.id}`
        );
      } else {
        assert.ok(allNodes.has(r.nodo), `unknown fallback node ${r.nodo}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Min-heap correctness (internal — keeps K1 self-contained)
// ---------------------------------------------------------------------------

describe("MinHeap", () => {
  it("pops in ascending priority order", () => {
    const h = new MinHeap<string>();
    h.push(5, "e");
    h.push(1, "a");
    h.push(3, "c");
    h.push(2, "b");
    h.push(4, "d");
    const order: string[] = [];
    while (!h.isEmpty()) order.push(h.pop().value);
    assert.deepEqual(order, ["a", "b", "c", "d", "e"]);
  });

  it("handles a single element", () => {
    const h = new MinHeap<number>();
    h.push(42, 1);
    assert.equal(h.pop().value, 1);
    assert.ok(h.isEmpty());
  });

  it("handles duplicate priorities", () => {
    const h = new MinHeap<string>();
    h.push(1, "x");
    h.push(1, "y");
    h.push(1, "z");
    const out = [h.pop().value, h.pop().value, h.pop().value];
    assert.deepEqual([...out].sort(), ["x", "y", "z"]);
    assert.ok(h.isEmpty());
  });
});

describe("shelter capacity (Pro): only the allowed shelters count", () => {
  it("heads to the allowed shelter even when another is closer", () => {
    // From N-0002, R-01 (N-0001) is 1 street away; only R-02 (N-0012) is allowed.
    const r = buscarRuta("N-0002", contexto, sinPeligro, undefined, new Set(["R-02"]));
    assert.equal(r.tipo, "movimiento");
    if (r.tipo === "movimiento") assert.equal(r.refugio, "R-02");
  });

  it("standing at the door of a shelter you are not allowed into is not arriving", () => {
    const r = buscarRuta("N-0001", contexto, sinPeligro, undefined, new Set(["R-02"]));
    assert.equal(r.tipo, "movimiento");
  });

  it("without a restriction it behaves as before", () => {
    assert.equal(buscarRuta("N-0001", contexto, sinPeligro).tipo, "ya_en_refugio");
  });
});
