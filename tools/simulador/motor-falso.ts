/**
 * Local fake motor for development.
 *
 * Replaces the real POST /paso while Kevin builds the route engine.
 * Strategy: pick the first valid neighbor that is not blocked and not occupied
 * by a visible zombie.  If no safe neighbor exists, stay put.
 *
 * This is intentionally simple — it is NOT a replacement for A*; its only
 * purpose is to produce valid, non-crashing moves so the turn loop can be
 * tested end-to-end.
 */
import type { GrafoIndexado } from "@abcstack/shared";
import type { Zombie } from "@abcstack/shared";
import { zombiesVisibles } from "@abcstack/shared";

export interface PedidoPaso {
  sobrevivienteId: string;
  nodoActual: string;
  turno: number;
}

export interface RespuestaPaso {
  siguienteNodo: string;
}

export interface ClienteMotor {
  /**
   * Ask the motor for the next step.
   * Must resolve within 500 ms; the turn coordinator enforces this.
   */
  pedirPaso(pedido: PedidoPaso, signal?: AbortSignal): Promise<RespuestaPaso>;
}

/**
 * Create a local motor client that never makes HTTP calls.
 *
 * @param grafo   Indexed graph — used to find neighbors and validate moves.
 * @param zombies A getter called on every request so it always reflects the
 *                current turn's zombie positions.
 */
export function crearMotorFalso(
  grafo: GrafoIndexado,
  obtenerZombies: () => readonly Zombie[],
  obtenerBloqueos: () => readonly string[] = () => [],
): ClienteMotor {
  return {
    async pedirPaso({ nodoActual, turno: _turno }) {
      const zombies = zombiesVisibles([...obtenerZombies()]);

      // Build the set of nodes that are either directly occupied or blocked by a horde.
      const peligrosos = grafo.nodosBloqueadosPorHordas(zombies);
      for (const z of zombies) peligrosos.add(z.nodo);

      const vecinos = grafo.vecinos(nodoActual);
      const aristasBloqueadas = obtenerBloqueos();

      for (const vecino of vecinos) {
        if (peligrosos.has(vecino)) continue;
        if (!grafo.esMovimientoValido(nodoActual, vecino, aristasBloqueadas)) continue;
        return { siguienteNodo: vecino };
      }

      // No safe neighbor — stay put.
      return { siguienteNodo: nodoActual };
    },
  };
}
