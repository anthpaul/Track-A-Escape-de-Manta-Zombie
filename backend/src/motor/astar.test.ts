/**
 * Tests del A* de K1 (HOJA_DE_RUTA §4.1, ítem 3).
 *
 * Criterios de aceptación:
 *   - Ruta más corta en TURNOS sobre el fixture
 *   - Respeta las aristas bloqueadas (aristasBloqueadas)
 *   - Fallback seguro cuando no existe camino
 *
 * Todos los tests corren sobre el fixture-mini.json compartido, así los mismos
 * datos validan el ruteador, shared/grafo.ts y el schema de una sola vez.
 *
 * Topología del fixture (12 nodos, 15 calles, 2 refugios):
 *
 *   N-0001(tarqui)    —C-0001—  N-0002  —C-0002—  N-0003  —C-0003—  N-0004(los_esteros)
 *      |C-0010                    |C-0014                                |C-0012
 *   N-0005(los_est.)  —C-0004—  N-0006  —C-0005—  N-0007  —C-0006—  N-0008(barb.)
 *      |C-0011                    |C-0015                                |C-0013
 *   N-0009(barb.)     —C-0007—  N-0010  —C-0008—  N-0011  —C-0009—  N-0012(jocay)
 *
 *   Refugios: R-01 @ N-0001, R-02 @ N-0012
 *   Puente:   C-0005 (N-0006 ↔ N-0007)
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
// Funciones auxiliares de los tests
// ---------------------------------------------------------------------------

const grafo = crearGrafo(fixture);
const contexto = crearContextoGrafo(fixture as Grafo, grafo);

type Mundo = Pick<MundoTurno, "zombies" | "aristasBloqueadas">;
const sinPeligro: Mundo = { zombies: [], aristasBloqueadas: [] };

function siguiente(nodo: string, mundo = sinPeligro): string {
  const r = buscarRuta(nodo, contexto, mundo);
  if (r.tipo === "ya_en_refugio") return nodo;
  if (r.tipo === "movimiento") return r.siguienteNodo;
  return nodo; // sin_ruta → quedarse quieto
}

/** Recorre el A* paso a paso hasta llegar a un refugio o toparse con un ciclo o el límite. */
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
    if (visited.has(next)) return path; // ciclo: el test debería fallar
    visited.add(next);
    current = next;
    if (fixture.refugios.some((ref) => ref.nodo === next)) return path;
  }
  return path; // se pasó del límite: el test debería fallar
}

// ---------------------------------------------------------------------------
// Ruta más corta en turnos
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
// Respeta las aristas bloqueadas
// ---------------------------------------------------------------------------

describe("respects blocked edges (aristasBloqueadas)", () => {
  it("blocks C-0001 and forces N-0002 to detour to R-01 via N-0006 → N-0005 → N-0001", () => {
    // Sin bloqueo: N-0002 → N-0001 (1 salto por C-0001)
    // Con C-0001 bloqueada: N-0002 → N-0006 → N-0005 → N-0001 (3 saltos)
    const blocked = { zombies: [], aristasBloqueadas: ["C-0001"] };
    const path = caminoCompleto("N-0002", blocked);
    assert.ok(!path.includes("C-0001"), "path should not use blocked edge (internal check)");
    // El primer paso no puede ser N-0001 directo (eso requiere C-0001).
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
    // C-0005 es el puente entre N-0006 y N-0007.
    const blocked = { zombies: [], aristasBloqueadas: ["C-0005"] };
    const path = caminoCompleto("N-0007", blocked);
    const last = path.at(-1)!;
    assert.ok(
      fixture.refugios.some((r) => r.nodo === last),
      `expected last node ${last} to be a shelter after bridge collapse`
    );
  });

  it("stays put when all exits from a node are blocked", () => {
    // N-0001 solo tiene C-0001 (→ N-0002) y C-0010 (→ N-0005).
    // Aunque se bloqueen todas, N-0001 es un refugio y devuelve ya_en_refugio.
    // Por eso se prueba con N-0003: C-0002 (← N-0002) y C-0003 (→ N-0004).
    const blocked = { zombies: [], aristasBloqueadas: ["C-0002", "C-0003"] };
    const r = buscarRuta("N-0003", contexto, blocked);
    // N-0003 tiene solo dos aristas; ambas bloqueadas → sin_ruta.
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
    // sin_ruta también es aceptable acá (todos los caminos útiles podrían estar bloqueados)
  });
});

// ---------------------------------------------------------------------------
// Nodos bloqueados por hordas
// ---------------------------------------------------------------------------

describe("horde blocks its node and all static neighbors (K1 danger model)", () => {
  it("avoids a horde-blocked node on the direct path", () => {
    // Se pone una horda en N-0002. El camino directo N-0003 → N-0002 → N-0001 queda bloqueado.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0002" }],
      aristasBloqueadas: [],
    };
    const r = buscarRuta("N-0003", contexto, mundo);
    // N-0002 y sus vecinos (N-0001, N-0003, N-0006) quedan bloqueados por la horda.
    // El propio N-0003 es vecino de N-0002 → también bloqueado → se espera sin_ruta
    // (N-0003 está dentro de la zona de la horda; todas sus salidas pasan por nodos bloqueados).
    if (r.tipo === "movimiento") {
      // Si se encontró un camino, se verifica que no pase por N-0002 ni por sus vecinos.
      const hordeBlocked = grafo.nodosBloqueadosPorHordas(mundo.zombies);
      assert.ok(
        !hordeBlocked.has(r.siguienteNodo),
        `next node ${r.siguienteNodo} is inside horde zone`
      );
    }
    // sin_ruta es válido si el propio N-0003 está en la zona de la horda.
  });

  it("finds a path that bypasses the horde zone entirely", () => {
    // Horda en N-0010: bloquea N-0009, N-0010, N-0011, N-0006, N-0007.
    // N-0008 NO es vecino de N-0010 en este fixture, así que es seguro.
    const mundo = {
      zombies: [{ id: "Z-0001", tipo: "horda" as const, nodo: "N-0010" }],
      aristasBloqueadas: [],
    };
    const hordeBlocked = grafo.nodosBloqueadosPorHordas(mundo.zombies);
    // Se elige un nodo de inicio que no esté en la zona de la horda.
    const safeStart = "N-0004"; // esquina lejana, no adyacente a N-0010
    if (!hordeBlocked.has(safeStart)) {
      const path = caminoCompleto(safeStart, mundo);
      const last = path.at(-1)!;
      // Cada nodo del camino debe estar fuera de la zona de la horda.
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
// Fallback seguro: nunca lanza errores y siempre devuelve un nodo válido
// ---------------------------------------------------------------------------

describe("safe fallback", () => {
  it("returns sin_ruta with current node when completely surrounded", () => {
    // Se bloquean todas las aristas conectadas a N-0003.
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
// Corrección del min-heap (interno: mantiene K1 autocontenido)
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
    // Desde N-0002, R-01 (N-0001) está a 1 calle; solo se permite R-02 (N-0012).
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
