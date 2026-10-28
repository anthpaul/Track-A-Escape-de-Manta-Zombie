/**
 * Motor falso local para desarrollo.
 *
 * Reemplaza al POST /paso real mientras Kevin construye el motor de rutas.
 * Estrategia: elige el primer vecino válido que no esté bloqueado ni ocupado
 * por un zombie visible. Si no hay ningún vecino seguro, se queda quieto.
 *
 * Es simple a propósito: NO reemplaza al A*; su único objetivo es producir
 * movimientos válidos que no rompan nada, para poder probar el ciclo de turnos
 * de punta a punta.
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
   * Pide al motor el siguiente paso.
   * Debe resolverse en menos de 500 ms; el coordinador de turnos lo hace cumplir.
   */
  pedirPaso(pedido: PedidoPaso, signal?: AbortSignal): Promise<RespuestaPaso>;
}

/**
 * Crea un cliente de motor local que nunca hace llamadas HTTP.
 *
 * @param grafo   Grafo indexado, para buscar vecinos y validar movimientos.
 * @param zombies Getter que se llama en cada pedido, para reflejar siempre las
 *                posiciones de los zombies del turno actual.
 */
export function crearMotorFalso(
  grafo: GrafoIndexado,
  obtenerZombies: () => readonly Zombie[],
  obtenerBloqueos: () => readonly string[] = () => [],
): ClienteMotor {
  return {
    async pedirPaso({ nodoActual, turno: _turno }) {
      const zombies = zombiesVisibles([...obtenerZombies()]);

      // Arma el conjunto de nodos ocupados directamente o bloqueados por una horda.
      const peligrosos = grafo.nodosBloqueadosPorHordas(zombies);
      for (const z of zombies) peligrosos.add(z.nodo);

      const vecinos = grafo.vecinos(nodoActual);
      const aristasBloqueadas = obtenerBloqueos();

      for (const vecino of vecinos) {
        if (peligrosos.has(vecino)) continue;
        if (!grafo.esMovimientoValido(nodoActual, vecino, aristasBloqueadas)) continue;
        return { siguienteNodo: vecino };
      }

      // No hay vecino seguro: se queda quieto.
      return { siguienteNodo: nodoActual };
    },
  };
}
