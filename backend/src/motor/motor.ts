/**
 * Motor singleton — loaded once per Lambda warm start (AGENTS.md §4.3).
 *
 * Responsibilities:
 *   1. Parse and index the static graph from shared/data/manta.json.
 *   2. Build the A* routing context (coordinates + shelters).
 *   3. Expose calcularSiguienteNodo — the single function that /paso calls.
 *
 * What this module does NOT do:
 *   - Read DynamoDB (that is FuenteMundo's job).
 *   - Choose which partition is active (that is the /paso route's job).
 *   - Write anything (AGENTS.md §4.2: /paso never writes to DynamoDB).
 */

import { crearGrafo, type Grafo } from "@abcstack/shared";
// manta.json is bundled by esbuild alongside handler.js; it is never fetched at runtime.
import grafoData from "@abcstack/shared/data/manta.json";
import { buscarRuta, crearContextoGrafo, type ContextoGrafo, type ResultadoBusqueda } from "./astar";
import { calcularPeligros } from "./peligros";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// One-time initialisation (outside the handler — survives warm starts)
// ---------------------------------------------------------------------------

const grafoIndexado = crearGrafo(grafoData);
const contexto: ContextoGrafo = crearContextoGrafo(grafoData as Grafo, grafoIndexado);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EntradaMotor {
  sobrevivienteId: string;
  nodoActual: string;
  mundo: MundoTurno;
}

export interface SalidaMotor {
  siguienteNodo: string;
  resultado: ResultadoBusqueda;
}

/**
 * Calculate the next node for one survivor given the current world state.
 *
 * Accepts an optional pre-computed `peligrosDelTurno` so the route handler
 * can call calcularPeligros once per turn and pass it to every survivor,
 * avoiding redundant re-computation for the same world snapshot.
 *
 * Never throws. Returns the current node as a safe fallback when no valid
 * move exists (AGENTS.md §4.3 rule 2).
 */
export function calcularSiguienteNodo(
  entrada: EntradaMotor,
  peligrosDelTurno?: ReturnType<typeof calcularPeligros>,
): SalidaMotor {
  const resultado = buscarRuta(
    entrada.nodoActual,
    contexto,
    entrada.mundo,
    peligrosDelTurno,
  );

  let siguienteNodo: string;
  switch (resultado.tipo) {
    case "movimiento":
      siguienteNodo = resultado.siguienteNodo;
      break;
    case "ya_en_refugio":
    case "sin_ruta":
      // Safe fallback: stay put (AGENTS.md §4.3).
      siguienteNodo = entrada.nodoActual;
      break;
  }

  return { siguienteNodo, resultado };
}

/**
 * Exposed for /paso route: pre-compute danger sets once per turn snapshot
 * before iterating over survivors.
 */
export { calcularPeligros as calcularPeligrosDelTurno };

/** Exposed for tests: the pre-built routing context. */
export { contexto as contextoGrafo };
