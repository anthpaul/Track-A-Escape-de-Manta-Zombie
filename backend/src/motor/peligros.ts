/**
 * Danger model — K2 implementation (AGENTS.md §4.4).
 *
 * Produces three danger sets consumed by the A* router on every request.
 * All inputs are pure data; no I/O, no side effects.
 *
 * AGENTS.md §4.4 table:
 *   Node with visible zombie            → Prohibited   (K2)
 *   Horde: node + all static neighbours → Prohibited   (K1 via shared/)
 *   Blocked edge (city event)           → Non-existent (K1)
 *   Nodes a runner can reach next turn  → Very high    (Pro K5 — not yet)
 *   Neighbours of a walker              → High penalty (K2)
 *   Edge a zombie can cross in opp. dir → Prohibited   (K2)
 *   Near possible sleeper               → No cost      (K2)
 */

import type { GrafoIndexado } from "@abcstack/shared";
import type { MundoTurno } from "./fuente-mundo";

export const WALKER_ADJACENT_PENALTY = 0.5;
export const RUNNER_PREDICTION_PENALTY = 0.9; // Pro K5 — not yet active

export interface Peligros {
  /**
   * Nodes the survivor must NOT enter.
   * Includes: any node with a visible zombie + horde-blocked zone.
   */
  nodosProhibidos: ReadonlySet<string>;

  /**
   * Extra cost added when the destination is adjacent to a walker.
   * Map<nodoId, extraCost> — additive for multiple walkers.
   */
  costosExtra: ReadonlyMap<string, number>;

  /**
   * Directed edges forbidden by the cross-traffic rule.
   * Format: "DESDE|HASTA" (the survivor's intended direction).
   */
  aristasCrucePeligroso: ReadonlySet<string>;
}

export function calcularPeligros(
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
  indexado: GrafoIndexado,
): Peligros {
  const nodosProhibidos = new Set<string>();
  const costosExtraRaw = new Map<string, number>();
  const aristasCrucePeligroso = new Set<string>();

  // Horde-blocked zone: node + all static neighbours (shared/ rule, K1).
  const bloqueadosPorHordas = indexado.nodosBloqueadosPorHordas(mundo.zombies);
  for (const nodo of bloqueadosPorHordas) {
    nodosProhibidos.add(nodo);
  }

  for (const zombie of mundo.zombies) {
    switch (zombie.tipo) {
      case "caminante":
      case "corredor":
      case "horda": {
        // Any node occupied by a visible zombie is prohibited (§4.4 row 1).
        nodosProhibidos.add(zombie.nodo);
        break;
      }
      case "dormido": {
        // Invisible — no data, no cost (§4.4 last row).
        break;
      }
    }

    // Walker neighbours → high-cost penalty (§4.4 row 5).
    if (zombie.tipo === "caminante") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
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
