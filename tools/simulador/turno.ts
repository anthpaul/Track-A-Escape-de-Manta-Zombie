/**
 * Turn coordinator — the heart of S1.
 *
 * Implements the exact sequence from AGENTS.md §4.5:
 *
 *   Step 1  Move zombies (delegated to S2; here we stub the list unchanged).
 *   Step 2  Apply city-event blockages for this turn.
 *   Step 3  Write TURNO#N with completo = false.
 *   Step 4  Call POST /paso for each active survivor (concurrently, capped).
 *   Step 5  Validate each response; fall back to "stay put" on timeout/error.
 *   Step 6  Write the complete turn (siguienteNodo + completo = true).
 *
 * Turns never overlap: we call esperarTick at the end to fill the 2-second
 * window, and we do not start turn N+1 until turn N's UpdateItem is done.
 *
 * Concurrency: survivors are queried in parallel batches of at most
 * MAX_CONCURRENCIA to avoid overwhelming the motor with 200 simultaneous
 * requests in R3.  The POST /paso deadline is enforced per-request with
 * Promise.race + a 500 ms timeout.
 */
import type { GrafoIndexado, Zombie, Sobreviviente } from "@abcstack/shared";
import type { ClienteMotor } from "./motor-falso";
import type { PersistenciaPartida, TurnoParcial } from "./persistencia";
import type { Reloj } from "./reloj";

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const DURACION_TURNO_MS = 2_000;
const PASO_TIMEOUT_MS = 500;
const MAX_CONCURRENCIA = 20;   // concurrent /paso calls per batch

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface ConfigTurno {
  /** Indexed graph (for movement validation). */
  grafo: GrafoIndexado;
  /** Current zombie state (mutable between turns). */
  zombies: Zombie[];
  /** Current survivor state (mutable between turns). */
  sobrevivientes: Sobreviviente[];
  /** Currently blocked street IDs (e.g. bridge collapse events). */
  aristasBloqueadas: string[];
  /** Motor client (real or fake). */
  motor: ClienteMotor;
  /** Persistence layer (in-memory or DynamoDB). */
  persistencia: PersistenciaPartida;
  /** Controllable clock. */
  reloj: Reloj;
  /** Unique partition ID for this round (e.g. "demo-r1-1793030400000"). */
  partidaId: string;
  /** Round number (1 | 2 | 3). */
  ronda: 1 | 2 | 3;
}

/** Summary returned after each turn for metrics / logging. */
export interface ResultadoTurno {
  turno: number;
  respuestasValidas: number;
  respuestasFallidas: number;   // timeout, HTTP error, or invalid move
  enRuta: number;
  aSalvo: number;
  mordidos: number;
  duracionMs: number;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function sleep(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );
}

/** Run an async task per item in bounded parallel batches. */
async function porLotes<T, R>(
  items: readonly T[],
  tamanoLote: number,
  tarea: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += tamanoLote) {
    const lote = items.slice(i, i + tamanoLote);
    resultados.push(...(await Promise.all(lote.map(tarea))));
  }
  return resultados;
}

// -------------------------------------------------------------------------
// Core: advance one turn
// -------------------------------------------------------------------------

/**
 * Advance the world by exactly one turn.
 *
 * `config.zombies` and `config.sobrevivientes` are mutated in place so the
 * caller's arrays stay up to date without re-reading from persistence.
 *
 * @param config  Shared mutable world state + injected dependencies.
 * @param turno   The turn number to execute (starts at 1 after turn-zero setup).
 */
export async function ejecutarTurno(
  config: ConfigTurno,
  turno: number,
): Promise<ResultadoTurno> {
  const iniciado = config.reloj.ahora();

  // -----------------------------------------------------------
  // Step 1: Move zombies.
  //
  // Full movement rules are implemented in S2.  For S1 we leave zombies in
  // place so the rest of the pipeline can be tested independently.
  // -----------------------------------------------------------
  // (no-op until S2)

  // -----------------------------------------------------------
  // Step 2: Apply city events for this turn.
  //
  // Events are scheduled externally (R2 bridge collapse, R3 blockages).
  // The caller updates config.aristasBloqueadas before calling us; we just
  // read it here.
  // -----------------------------------------------------------

  // -----------------------------------------------------------
  // Step 3: Write TURNO#N with completo = false.
  // -----------------------------------------------------------
  const sobrevivientesAntesDeMoverse: Sobreviviente[] = config.sobrevivientes.map(
    (s) => ({ ...s }),
  );
  const zombiesActuales: Zombie[] = config.zombies.map((z) => ({ ...z }));

  const parcial: TurnoParcial = {
    turno,
    zombies: zombiesActuales,
    aristasBloqueadas: [...config.aristasBloqueadas],
    sobrevivientes: sobrevivientesAntesDeMoverse,
  };
  await config.persistencia.guardarTurnoIncompleto(parcial);

  // -----------------------------------------------------------
  // Step 4 + 5: Query the motor for each active survivor.
  //
  // We only call /paso for survivors that are still "en_ruta".
  // For each call we enforce a hard 500 ms deadline; any timeout or error
  // counts as "stay put" (the survivor does not move that turn).
  // -----------------------------------------------------------
  const activos = config.sobrevivientes.filter((s) => s.estado === "en_ruta");
  let respuestasValidas = 0;
  let respuestasFallidas = 0;

  const decisiones = new Map<string, string>();

  const consultarMotor = async (sobreviviente: Sobreviviente): Promise<void> => {
    try {
      const respuesta = await Promise.race([
        config.motor.pedirPaso({
          sobrevivienteId: sobreviviente.id,
          nodoActual: sobreviviente.nodo,
          turno,
        }),
        sleep(PASO_TIMEOUT_MS),
      ]);

      // Validate: must be the same node or a neighbor via a non-blocked street.
      const esValido = config.grafo.esMovimientoValido(
        sobreviviente.nodo,
        respuesta.siguienteNodo,
        config.aristasBloqueadas,
      );

      if (esValido) {
        decisiones.set(sobreviviente.id, respuesta.siguienteNodo);
        respuestasValidas++;
      } else {
        // Invalid move → stay put.
        decisiones.set(sobreviviente.id, sobreviviente.nodo);
        respuestasFallidas++;
      }
    } catch {
      // Timeout or network error → stay put.
      decisiones.set(sobreviviente.id, sobreviviente.nodo);
      respuestasFallidas++;
    }
  };

  await porLotes(activos, MAX_CONCURRENCIA, consultarMotor);

  // -----------------------------------------------------------
  // Step 6: Apply movements, resolve arrivals, write completo = true.
  //
  // Full bite resolution (node collision + crossing) is implemented in S3.
  // For S1 we only apply the movement and check arrivals.
  // -----------------------------------------------------------
  // Apply survivor movements.
  // Shelter arrival detection lives in correrRonda, which has access to the
  // refuge node IDs.  ejecutarTurno only moves survivors to the decided node.
  for (const sobreviviente of config.sobrevivientes) {
    if (sobreviviente.estado !== "en_ruta") continue;
    const siguienteNodo = decisiones.get(sobreviviente.id) ?? sobreviviente.nodo;
    sobreviviente.nodo = siguienteNodo;
    sobreviviente.siguienteNodo = siguienteNodo;
  }

  await config.persistencia.completarTurno(turno, decisiones);

  // -----------------------------------------------------------
  // Wait until the tick window is full.
  // -----------------------------------------------------------
  await config.reloj.esperarTick(iniciado, DURACION_TURNO_MS);

  const duracionMs = config.reloj.ahora() - iniciado;

  return {
    turno,
    respuestasValidas,
    respuestasFallidas,
    enRuta: config.sobrevivientes.filter((s) => s.estado === "en_ruta").length,
    aSalvo: config.sobrevivientes.filter((s) => s.estado === "a_salvo").length,
    mordidos: config.sobrevivientes.filter((s) => s.estado === "mordido").length,
    duracionMs,
  };
}

// -------------------------------------------------------------------------
// Round runner
// -------------------------------------------------------------------------

export interface ConfigRonda extends Omit<ConfigTurno, "zombies" | "sobrevivientes"> {
  zombies: Zombie[];
  sobrevivientes: Sobreviviente[];
  /** Set of refuge node IDs — arrivals are detected here. */
  nodosRefugio: ReadonlySet<string>;
  /** Total number of turns to run (e.g. 150 for a 5-minute round at 2 s/turn). */
  totalTurnos: number;
  /** Optional callback invoked after each turn completes (for logging / metrics). */
  onTurno?: (resultado: ResultadoTurno) => void;
  /** Optional abort signal — check each turn to stop early. */
  signal?: AbortSignal;
}

/**
 * Run a complete round from turn 1 to `totalTurnos`.
 * Returns an array of ResultadoTurno, one per turn executed.
 */
export async function correrRonda(config: ConfigRonda): Promise<ResultadoTurno[]> {
  const resultados: ResultadoTurno[] = [];

  // Build a config that also handles shelter arrivals.
  const configTurno: ConfigTurno = {
    grafo: config.grafo,
    zombies: config.zombies,
    sobrevivientes: config.sobrevivientes,
    aristasBloqueadas: config.aristasBloqueadas,
    motor: config.motor,
    persistencia: config.persistencia,
    reloj: config.reloj,
    partidaId: config.partidaId,
    ronda: config.ronda,
  };

  // Patch ejecutarTurno's arrival logic for this round's refuge nodes.
  // We monkey-patch the survivors array so when ejecutarTurno does
  // `s.nodo = siguienteNodo` and then we check here, it reflects the move.
  // Actually: we call ejecutarTurno and then apply arrivals to the same array.
  const nodosRefugio = config.nodosRefugio;

  for (let n = 1; n <= config.totalTurnos; n++) {
    if (config.signal?.aborted) break;

    const resultado = await ejecutarTurno(configTurno, n);

    // Apply shelter arrivals after the move (ejecutarTurno moved the survivors).
    for (const s of config.sobrevivientes) {
      if (s.estado === "en_ruta" && nodosRefugio.has(s.nodo)) {
        s.estado = "a_salvo";
      }
    }

    // Recount after arrival update.
    const corregido: ResultadoTurno = {
      ...resultado,
      enRuta: config.sobrevivientes.filter((s) => s.estado === "en_ruta").length,
      aSalvo: config.sobrevivientes.filter((s) => s.estado === "a_salvo").length,
      mordidos: config.sobrevivientes.filter((s) => s.estado === "mordido").length,
    };

    resultados.push(corregido);
    config.onTurno?.(corregido);

    // Stop early when no one is still moving.
    if (corregido.enRuta === 0) break;
  }

  return resultados;
}
