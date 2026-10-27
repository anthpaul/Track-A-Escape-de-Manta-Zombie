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
 *   Nodes a RUNNER can reach next turn          → Very high    (Pro K5 — not yet)
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
 * Placeholder for runner-reachable nodes (Pro K5 — prediction).
 * NOT applied by calcularPeligros until K5 is implemented.
 */
export const RUNNER_PREDICTION_PENALTY = 0.9; // Pro K5 — not yet active

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
