/**
 * Danger model — K2 implementation (AGENTS.md §4.4).
 *
 * Produces three danger sets consumed by the A* router on every request.
 * All inputs are pure data; no I/O, no side effects.
 *
 * AGENTS.md §4.4 — full table:
 *   Node with visible zombie                    → Prohibited   (K2 ✓)
 *   Horde: its node AND all static neighbours   → Prohibited   (K1 ✓)
 *   Blocked edge (city event)                   → Non-existent (K1 ✓)
 *   Nodes a RUNNER can reach next turn          → Very high    (Pro K5 ✓)
 *   Neighbours of a WALKER                      → High penalty (K2 ✓)
 *   Edge a zombie can cross in opposite dir.    → Prohibited   (K2 ✓)
 *   Near possible SLEEPER locations             → No cost      (K2 ✓)
 *
 * Cross-traffic rule (cruce de frente):
 *   A survivor biting happens when both entities traverse the SAME edge in
 *   OPPOSITE directions in the same turn (AGENTS.md §0 — reglas de mordida).
 *   The motor forbids edge A→B when a zombie at B could move to A through
 *   that same street. "Could move":
 *     - Walker  (caminante): assumed able to move (safe over-approximation).
 *     - Runner  (corredor):  2 streets/turn — definitely can cross 1 edge.
 *     - Horde:  almost immobile — cannot cross; zone already prohibited.
 *     - Sleeper (dormido):   invisible — motor has no data, no cost applied.
 */

import type { GrafoIndexado } from "@abcstack/shared";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Penalty constants
// ---------------------------------------------------------------------------

/**
 * Added to the A* edge cost when the destination is a walker-adjacent node.
 * Must be < 1 so it never makes a 1-hop safe route look worse than a 0-hop stay,
 * but large enough to prefer paths that avoid walker-adjacent nodes.
 *
 * Budget: ε_time_max = 0.0001 × (2000 m / 1.0 m·s⁻¹) = 0.2
 * WALKER_ADJACENT_PENALTY = 0.5 → clearly > ε_time_max, safely < 1 turn.
 */
export const WALKER_ADJACENT_PENALTY = 0.5;

/**
 * Added for every node a runner can reach next turn (Pro K5 — prediction).
 * A runner moves up to 2 unblocked streets per turn (shared/reglas.ts moverZombie),
 * so it can end on any node within 2 streets. Higher than the walker penalty but
 * still < 1 turn: it detours around runners without ever refusing a shelter.
 * Additive across runners.
 */
export const RUNNER_PREDICTION_PENALTY = 0.9;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface Peligros {
  /**
   * Nodes the survivor must NOT enter.
   * Includes: any node occupied by a visible zombie + horde-blocked zone
   * (horde node and all its static neighbours, computed by shared/).
   */
  nodosProhibidos: ReadonlySet<string>;

  /**
   * Extra cost added when the A* expands an edge whose destination node
   * is adjacent to a walker. The node itself is NOT prohibited.
   * Map<nodoId, extraCost> — additive for multiple walkers.
   */
  costosExtra: ReadonlyMap<string, number>;

  /**
   * Directed edges forbidden by the cross-traffic rule.
   * Format: "DESDE|HASTA" (the survivor's intended direction).
   * Example: zombie at N-0002, survivor wants N-0001→N-0002 →
   *   stored as "N-0001|N-0002".
   */
  aristasCrucePeligroso: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compute all danger sets for one turn.
 * Called once per /paso request (or shared across survivors for the same turn).
 */
export function calcularPeligros(
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
  indexado: GrafoIndexado,
): Peligros {
  const nodosProhibidos = new Set<string>();
  const costosExtraRaw = new Map<string, number>();
  const aristasCrucePeligroso = new Set<string>();

  // Horde-blocked zone: node + all static neighbours (K1, via shared/).
  const bloqueadosPorHordas = indexado.nodosBloqueadosPorHordas(mundo.zombies);
  for (const nodo of bloqueadosPorHordas) {
    nodosProhibidos.add(nodo);
  }

  for (const zombie of mundo.zombies) {
    switch (zombie.tipo) {
      // Any visible zombie on a node makes it prohibited (§4.4 row 1).
      // Horde already added above; adding again is idempotent.
      case "caminante":
      case "corredor":
      case "horda": {
        nodosProhibidos.add(zombie.nodo);
        break;
      }
      // Sleeper: invisible, no data, no cost (§4.4 last row).
      case "dormido": {
        break;
      }
    }

    // Walker neighbours → high-cost penalty (§4.4 row 5).
    if (zombie.tipo === "caminante") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        // Only penalize nodes not already prohibited.
        if (!nodosProhibidos.has(vecino)) {
          costosExtraRaw.set(vecino, (costosExtraRaw.get(vecino) ?? 0) + WALKER_ADJACENT_PENALTY);
        }
      }
    }

    // Runner prediction (§4.4 row 4, Pro K5): nodes it can reach next turn.
    if (zombie.tipo === "corredor") {
      for (const nodo of alcanceCorredor(zombie.nodo, indexado, mundo.aristasBloqueadas)) {
        costosExtraRaw.set(nodo, (costosExtraRaw.get(nodo) ?? 0) + RUNNER_PREDICTION_PENALTY);
      }
    }

    // Cross-traffic rule (§4.4 row 6): walkers and runners can cross edges.
    // Forbidden survivor direction: vecino → zombie.nodo.
    if (zombie.tipo === "caminante" || zombie.tipo === "corredor") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        aristasCrucePeligroso.add(`${vecino}|${zombie.nodo}`);
      }
    }
  }

  return { nodosProhibidos, costosExtra: costosExtraRaw, aristasCrucePeligroso };
}

/**
 * Nodes within 2 unblocked streets of a runner, excluding its own node
 * (already prohibited). Same movement limits as shared/reglas.ts moverZombie.
 */
function alcanceCorredor(
  origen: string,
  indexado: GrafoIndexado,
  aristasBloqueadas: MundoTurno["aristasBloqueadas"],
): Set<string> {
  const alcanzados = new Set<string>();
  let frontera = [origen];
  for (let paso = 0; paso < 2; paso++) {
    const siguiente: string[] = [];
    for (const nodo of frontera) {
      for (const vecino of indexado.vecinos(nodo)) {
        if (vecino === origen || alcanzados.has(vecino)) continue;
        if (!indexado.esMovimientoValido(nodo, vecino, aristasBloqueadas)) continue;
        alcanzados.add(vecino);
        siguiente.push(vecino);
      }
    }
    frontera = siguiente;
  }
  return alcanzados;
}

// ---------------------------------------------------------------------------
// Edge cost helper — used by A* to apply danger penalties
// ---------------------------------------------------------------------------

/**
 * Returns the extra danger cost for moving from `desde` to `hasta`.
 * Returns Infinity when the move is forbidden by any K2 danger rule.
 */
export function costoPeligroArista(
  peligros: Peligros,
  hasta: string,
  edgeKey: string,
): number {
  if (peligros.nodosProhibidos.has(hasta)) return Infinity;
  if (peligros.aristasCrucePeligroso.has(edgeKey)) return Infinity;
  return peligros.costosExtra.get(hasta) ?? 0;
}
