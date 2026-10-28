/**
 * Modelo de peligro: implementación de K2 (AGENTS.md §4.4).
 *
 * Produce tres conjuntos de peligro que el ruteador A* usa en cada pedido.
 * Todas las entradas son datos puros: sin I/O ni efectos secundarios.
 *
 * AGENTS.md §4.4, tabla completa:
 *   Nodo con zombie visible                          → Prohibido          (K2 ✓)
 *   Horda: su nodo Y todos sus vecinos estáticos     → Prohibido          (K1 ✓)
 *   Arista bloqueada (evento de ciudad)              → No existe          (K1 ✓)
 *   Nodos que un CORREDOR alcanza el próximo turno   → Muy alto           (Pro K5 ✓)
 *   Vecinos de un CAMINANTE                          → Penalización alta  (K2 ✓)
 *   Arista que un zombie puede cruzar en sentido opuesto → Prohibido      (K2 ✓)
 *   Cerca de posibles DORMIDOS                       → Sin costo          (K2 ✓)
 *
 * Regla del cruce de frente:
 *   Hay mordida cuando ambas entidades recorren la MISMA arista en sentidos
 *   OPUESTOS en el mismo turno (AGENTS.md §0, reglas de mordida).
 *   El motor prohíbe la arista A→B cuando un zombie en B podría moverse a A por
 *   esa misma calle. "Podría moverse":
 *     - Caminante: se asume que puede moverse (sobreaproximación segura).
 *     - Corredor: 2 calles por turno; seguro puede cruzar 1 arista.
 *     - Horda: casi inmóvil; no puede cruzar y su zona ya está prohibida.
 *     - Dormido: invisible; el motor no tiene datos y no aplica costo.
 */

import type { GrafoIndexado, Zombie } from "@abcstack/shared";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Constantes de penalización
// ---------------------------------------------------------------------------

/**
 * Se suma al costo de arista del A* cuando el destino es un nodo vecino de un caminante.
 * Debe ser < 1 para que una ruta segura de 1 salto nunca parezca peor que quedarse
 * (0 saltos), pero lo bastante grande para preferir caminos que eviten esos nodos.
 *
 * Presupuesto: ε_tiempo_max = 0.0001 × (2000 m / 1.0 m·s⁻¹) = 0.2
 * WALKER_ADJACENT_PENALTY = 0.5 → claramente > ε_tiempo_max y con margen < 1 turno.
 */
export const WALKER_ADJACENT_PENALTY = 0.5;

/**
 * Se suma por cada nodo que un corredor puede alcanzar el próximo turno (Pro K5: predicción).
 * Un corredor avanza hasta 2 calles no bloqueadas por turno (moverZombie en shared/reglas.ts),
 * así que puede terminar en cualquier nodo a 2 calles o menos. Es mayor que la penalización
 * del caminante pero sigue siendo < 1 turno: rodea a los corredores sin rechazar nunca un
 * refugio. Se acumula entre corredores.
 */
export const RUNNER_PREDICTION_PENALTY = 0.9;

// ---------------------------------------------------------------------------
// Tipo de salida
// ---------------------------------------------------------------------------

export interface Peligros {
  /**
   * Nodos a los que el sobreviviente NO debe entrar.
   * Incluye: cualquier nodo ocupado por un zombie visible + la zona bloqueada por
   * hordas (el nodo de la horda y todos sus vecinos estáticos, calculados en shared/).
   */
  nodosProhibidos: ReadonlySet<string>;

  /**
   * Costo extra que se suma cuando el A* expande una arista cuyo nodo destino
   * es vecino de un caminante. El nodo en sí NO está prohibido.
   * Map<nodoId, costoExtra>: se acumula si hay varios caminantes.
   */
  costosExtra: ReadonlyMap<string, number>;

  /**
   * Aristas dirigidas prohibidas por la regla del cruce de frente.
   * Formato: "DESDE|HASTA" (la dirección que pretende tomar el sobreviviente).
   * Ejemplo: zombie en N-0002 y el sobreviviente quiere ir N-0001→N-0002 →
   *   se guarda como "N-0001|N-0002".
   */
  aristasCrucePeligroso: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Calcula todos los conjuntos de peligro de un turno.
 * Se llama una vez por pedido a /paso (o se comparte entre los sobrevivientes del mismo turno).
 */
/**
 * Los dormidos se aceptan a propósito: nuestro simulador nunca los publica, pero un
 * mundo leído de otra fuente (Q3) podría incluirlos, y no deben tener costo.
 */
export type MundoPeligros = {
  readonly zombies: readonly Zombie[];
  readonly aristasBloqueadas: MundoTurno["aristasBloqueadas"];
};

export function calcularPeligros(
  mundo: MundoPeligros,
  indexado: GrafoIndexado,
): Peligros {
  const nodosProhibidos = new Set<string>();
  const costosExtraRaw = new Map<string, number>();
  const aristasCrucePeligroso = new Set<string>();

  // Zona bloqueada por hordas: nodo + todos sus vecinos estáticos (K1, vía shared/).
  const bloqueadosPorHordas = indexado.nodosBloqueadosPorHordas(mundo.zombies);
  for (const nodo of bloqueadosPorHordas) {
    nodosProhibidos.add(nodo);
  }

  for (const zombie of mundo.zombies) {
    switch (zombie.tipo) {
      // Cualquier zombie visible en un nodo lo vuelve prohibido (§4.4, fila 1).
      // La horda ya se agregó arriba; agregarla de nuevo es idempotente.
      case "caminante":
      case "corredor":
      case "horda": {
        nodosProhibidos.add(zombie.nodo);
        break;
      }
      // Dormido: invisible, sin datos, sin costo (§4.4, última fila).
      case "dormido": {
        break;
      }
    }

    // Vecinos de un caminante → penalización alta (§4.4, fila 5).
    if (zombie.tipo === "caminante") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        // Solo se penalizan los nodos que no estén ya prohibidos.
        if (!nodosProhibidos.has(vecino)) {
          costosExtraRaw.set(vecino, (costosExtraRaw.get(vecino) ?? 0) + WALKER_ADJACENT_PENALTY);
        }
      }
    }

    // Predicción de corredores (§4.4, fila 4, Pro K5): nodos que puede alcanzar el próximo turno.
    if (zombie.tipo === "corredor") {
      for (const nodo of alcanceCorredor(zombie.nodo, indexado, mundo.aristasBloqueadas)) {
        costosExtraRaw.set(nodo, (costosExtraRaw.get(nodo) ?? 0) + RUNNER_PREDICTION_PENALTY);
      }
    }

    // Regla del cruce (§4.4, fila 6): caminantes y corredores pueden cruzar aristas.
    // Dirección prohibida para el sobreviviente: vecino → zombie.nodo.
    if (zombie.tipo === "caminante" || zombie.tipo === "corredor") {
      for (const vecino of indexado.vecinos(zombie.nodo)) {
        aristasCrucePeligroso.add(`${vecino}|${zombie.nodo}`);
      }
    }
  }

  return { nodosProhibidos, costosExtra: costosExtraRaw, aristasCrucePeligroso };
}

/**
 * Nodos a 2 calles no bloqueadas o menos de un corredor, sin contar su propio nodo
 * (ya prohibido). Mismos límites de movimiento que moverZombie en shared/reglas.ts.
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
// Costo de arista: lo usa el A* para aplicar las penalizaciones por peligro
// ---------------------------------------------------------------------------

/**
 * Devuelve el costo extra de peligro de moverse de `desde` a `hasta`.
 * Devuelve Infinity cuando alguna regla de peligro de K2 prohíbe el movimiento.
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
