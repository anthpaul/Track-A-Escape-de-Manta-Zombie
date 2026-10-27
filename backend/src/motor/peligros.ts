/**
 * Danger model — K2 implementation (AGENTS.md §4.4).
 *
 * Produces three danger sets consumed by the A* router on every request.
 * All inputs are pure data; no I/O, no side effects.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  AGENTS.md §4.4 — full table                                            │
 * ├──────────────────────────────────────────────┬──────────────────────────┤
 * │  Situation                                   │  Treatment               │
 * ├──────────────────────────────────────────────┼──────────────────────────┤
 * │  Node with visible zombie                    │  Prohibited   (K2 ✓)    │
 * │  Horde: its node AND all static neighbours   │  Prohibited   (K1 ✓)    │
 * │  Blocked edge (city event)                   │  Non-existent (K1 ✓)    │
 * │  Nodes a RUNNER can reach next turn          │  Very high    (Pro K5)  │
 * │  Neighbours of a WALKER                      │  High penalty (K2 ✓)    │
 * │  Edge a zombie can cross in opposite dir.    │  Prohibited   (K2 ✓)    │
 * │  Near possible SLEEPER locations             │  No cost      (K2 ✓)    │
 * └──────────────────────────────────────────────┴──────────────────────────┘
 *
 * Notes on the cross-traffic rule (cruce de frente):
 *   A survivor biting happens when both entities traverse the SAME edge in
 *   OPPOSITE directions in the same turn (AGENTS.md §0 — reglas de mordida).
 *   The motor forbids an edge A→B when a zombie currently on B (or a zombie
 *   on A that is NOT the survivor) could move to A through that same edge.
 *   "Could move" means the zombie type has a remaining move budget:
 *     - Walker  (caminante):  1 street per 2 turns — assumed able to move
 *       (motor does not know walker turn parity, so it errs on safety).
 *     - Runner  (corredor):   2 streets per turn — definitely can cross 1 edge.
 *     - Horde:  almost immobile — cannot cross; its zone is already prohibited.
 *     - Sleeper (dormido):    invisible — motor has no data, no cost applied.
 */

import type { GrafoIndexado } from "@abcstack/shared";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Penalty constants
// ---------------------------------------------------------------------------

/**
 * Added to the A* edge cost when the destination is a walker-adjacent node.
 * Must be < 1 so it never makes a 1-hop safe route look worse than a
 * 0-hop stay (there is none), but large enough to prefer paths that avoid
 * walker-adjacent nodes when alternatives exist with the same hop count.
 *
 * Budget: ε_time_max = 0.0001 × (2000 m / 1.0 m·s⁻¹) = 0.2
 * WALKER_ADJACENT_PENALTY = 0.5 → clearly > ε_time_max, safely < 1 turn.
 */
export const WALKER_ADJACENT_PENALTY = 0.5;

/**
 * Placeholder cost for runner-reachable nodes (Pro K5 — prediction).
 * Kept here so K3/route tests can reference the constant without
 * importing a Pro module that does not exist yet.
 * NOT applied by calcularPeligros until K5 is implemented.
 */
export const RUNNER_PREDICTION_PENALTY = 0.9; // Pro K5 — not yet active

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface Peligros {
  /**
   * Nodes that are completely forbidden for the survivor to enter.
   * Includes: any node occupied by a visible zombie + horde-blocked zone
   * (horde node and all its static neighbours, already computed by shared/).
   *
   * The A* router must NOT expand into these nodes.
   */
  nodosProhibidos: ReadonlySet<string>;

  /**
   * Extra cost added when the A* expands an edge whose destination node
   * is adjacent to a walker. The node itself is NOT prohibited — the
   * survivor can enter it, but the router prefers alternatives.
   *
   * Map<nodoId, extraCost>. Costs are additive; a node adjacent to two
   * walkers accumulates two penalties.
   */
  costosExtra: ReadonlyMap<string, number>;

  /**
   * Directed edges forbidden by the cross-traffic rule.
   * A survivor must NOT traverse edge A→B when a zombie could cross B→A
   * through the same street in the same turn.
   *
   * Set of strings in the canonical form "DESDE|HASTA" (the direction the
   * SURVIVOR wants to move, not the zombie's direction).
   * Example: zombie at N-0002, survivor wants N-0001→N-0002 via C-0001 →
   *   forbidden edge stored as "N-0001|N-0002".
   */
  aristasCrucePeligroso: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compute all danger sets for one turn.
 * Called once per /paso request, before the A* search.
 *
 * @param mundo  - Immutable world snapshot for this turn (zombies + blocked edges).
 * @param indexado - Pre-built graph index (neighbours, edge lookups).
 * @returns Peligros — three pure sets the A* router consumes directly.
 */
export function calcularPeligros(
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
  indexado: GrafoIndexado,
): Peligros {
  const nodosProhibidos = new Set<string>();
  const costosExtraRaw = new Map<string, number>();
  const aristasCrucePeligroso = new Set<string>();

  // Horde-blocked zone: node + all static neighbours (shared/ rule, K1).
  // We re-compute it here so Peligros is the single source of truth for the
  // A* router — it no longer calls nodosBloqueadosPorHordas directly.
  const bloqueadosPorHordas = indexado.nodosBloqueadosPorHordas(mundo.zombies);
  for (const nodo of bloqueadosPorHordas) {
    nodosProhibidos.add(nodo);
  }

  for (const zombie of mundo.zombies) {
    switch (zombie.tipo) {
      // ------------------------------------------------------------------
      // VISIBLE ZOMBIE on a node → that node is prohibited (§4.4 row 1).
      // This applies to walkers, runners, and hordes (horde already added
      // above via bloqueadosPorHordas; adding again is idempotent).
      // ------------------------------------------------------------------
      case "caminante":
      case "corredor":
      case "horda": {
        nodosProhibidos.add(zombie.nodo);
        break;
      }

      // ------------------------------------------------------------------
      // SLEEPER — invisible, no data, no cost (§4.4 last row).
      // Explicitly handled so TypeScript exhaustiveness check catches new types.
      // ------------------------------------------------------------------
      case "dormido": {
        // Motor does not make guesses about invisible zombies.
        break;
      }
    }

    // ------------------------------------------------------------------
    // WALKER NEIGHBOURS → high-cost penalty (§4.4 row 5).
    // The survivor CAN enter a walker-adjacent node, but the router
    // prefers alternatives. Accumulated if multiple walkers are nearby.
    // ------------------------------------------------------------------
    if (zombie.tipo === "caminante") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        // Only add penalty if the node is not already outright prohibited
        // (no point penalizing a node the survivor can't enter anyway).
        if (!nodosProhibidos.has(vecino)) {
          costosExtraRaw.set(vecino, (costosExtraRaw.get(vecino) ?? 0) + WALKER_ADJACENT_PENALTY);
        }
      }
    }

    // ------------------------------------------------------------------
    // CROSS-TRAFFIC RULE — cruce de frente (§4.4 row 6).
    //
    // Forbidden edge for survivor: A → B via street S
    // when zombie is at B and could move to A via the same street S.
    //
    // "Could move":
    //   - Walker  (caminante): assumed able to move (safe over-approximation).
    //   - Runner  (corredor):  can definitely move (2 streets/turn).
    //   - Horde:  cannot cross an edge (almost immobile); already prohibited.
    //   - Sleeper: invisible, skipped.
    //
    // We mark the SURVIVOR'S intended direction: "zombieNodo|vecino"
    // meaning the survivor wants to move from vecino → zombieNodo and the
    // zombie could come back through the same edge.
    // ------------------------------------------------------------------
    if (zombie.tipo === "caminante" || zombie.tipo === "corredor") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        // The edge between zombie.nodo and vecino exists (vecino is a neighbour).
        // Forbidden survivor direction: vecino → zombie.nodo
        // (survivor walks into the zombie coming the other way).
        aristasCrucePeligroso.add(`${vecino}|${zombie.nodo}`);
      }
    }
  }

  return {
    nodosProhibidos,
    costosExtra: costosExtraRaw,
    aristasCrucePeligroso,
  };
}

// ---------------------------------------------------------------------------
// Edge cost helper — used by A* to apply danger penalties
// ---------------------------------------------------------------------------

/**
 * Returns the extra danger cost for moving from `desde` to `hasta`.
 * Returns Infinity when the move is forbidden by any K2 danger rule.
 *
 * @param peligros  - Pre-computed danger sets for this turn.
 * @param hasta     - Destination node the survivor wants to enter.
 * @param edgeKey   - Canonical "DESDE|HASTA" direction of the survivor's move.
 */
export function costoPeligroArista(
  peligros: Peligros,
  hasta: string,
  edgeKey: string,
): number {
  // Destination node is outright forbidden.
  if (peligros.nodosProhibidos.has(hasta)) return Infinity;

  // Edge is forbidden by the cross-traffic rule.
  if (peligros.aristasCrucePeligroso.has(edgeKey)) return Infinity;

  // Destination has an extra walker-adjacency penalty.
  return peligros.costosExtra.get(hasta) ?? 0;
}
