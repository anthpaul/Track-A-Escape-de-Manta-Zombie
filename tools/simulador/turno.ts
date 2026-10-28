/**
 * Turn coordinator — S1 + S2 + S3.
 *
 * Implements the exact sequence from AGENTS.md §4.5:
 *
 *   Step 1  Awaken sleeping zombies, then move all zombies.
 *   Step 2  Apply city-event blockages for this turn.
 *   Step 3  Write TURNO#N with completo = false.
 *   Step 4  Call POST /paso for every active survivor in one concurrent window.
 *   Step 5  Validate each response; fall back to "stay put" on timeout/error.
 *   Step 6  Move survivors, resolve bites (node + crossing), check arrivals,
 *           write completo = true.
 *
 * Turns never overlap: we call esperarTick at the end to fill the 2-second
 * window, and we do not start turn N+1 until turn N's UpdateItem is done.
 *
 * The round configuration bounds the population to at most 200 survivors.
 * Sequential batches would turn 200 timeouts into a five-second turn.
 * Every request instead has a concurrent 500 ms deadline and abort signal.
 */
import type { GrafoIndexado, Zombie, Sobreviviente } from "@abcstack/shared";
import type { Vehiculo } from "@abcstack/shared";
import {
  despertarDormidos,
  moverZombie,
  resolverMordidasPorNodo,
  resolverMordidasPorCruce,
  resolverLlegadas,
  moverFlota,
  zombiesVisibles,
  aplicarBloqueo,
} from "@abcstack/shared";
import type { ZombieInterno } from "@abcstack/shared";
import type { ClienteMotor } from "./motor-falso";
import type { PersistenciaPartida, TurnoParcial } from "./persistencia";
import type { Reloj } from "./reloj";

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const DURACION_TURNO_MS = 2_000;
const PASO_TIMEOUT_MS = 500;

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface EventoRonda {
  /** Turn number when the blockage takes effect. */
  turno: number;
  /** Street ID to block (AGENTS.md §0 — city events). */
  calleId: string;
  /** Human-readable label for logging (e.g. "bridge collapse R2"). */
  descripcion?: string;
}

export interface ConfigTurno {
  /** Indexed graph (for movement validation). */
  grafo: GrafoIndexado;
  /** Current zombie state (mutable between turns) — includes sleeping zombies. */
  zombies: ZombieInterno[];
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
  /** Set of refuge node IDs — survivors arriving here become "a_salvo". */
  nodosRefugio: ReadonlySet<string>;
  /** Refuge node → capacity (Pro). A full refuge admits nobody else; without it every arrival gets in. */
  capacidadRefugio?: ReadonlyMap<string, number>;
  /** Rescue fleet (Pro, shared/flota.ts). Demo rounds only: evaluation rounds have none. */
  flota?: Vehiculo[];
  /** Seeded random number generator — injected for reproducibility. */
  aleatorio: () => number;
  /** Scheduled city events — applied at their designated turn (Step 2). */
  eventos?: readonly EventoRonda[];
  /**
   * Next planned step of a survivor from its current node. When set (in-process demo rounds), the
   * completed turn publishes it as siguienteNodo so the map can draw each survivor's arrow; without
   * it (HTTP rounds, where planning would cost an extra /paso call) siguienteNodo is the step just taken.
   */
  planificarSiguiente?: (sobreviviente: Sobreviviente) => string;
}

/** Summary returned after each turn for metrics / logging. */
export interface ResultadoTurno {
  turno: number;
  respuestasValidas: number;
  respuestasFallidas: number;   // timeout, HTTP error, or invalid move
  /** People the rescue fleet brought to a shelter this turn (rounds with a fleet). */
  rescatadosFlota?: number;
  enRuta: number;
  aSalvo: number;
  mordidos: number;
  duracionMs: number;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------


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
  // Step 1: Awaken sleeping zombies, then move all zombies.
  // -----------------------------------------------------------
  despertarDormidos(config.zombies, config.sobrevivientes, config.grafo);

  // Snapshot zombie positions BEFORE moving (needed for crossing-bite detection).
  const previoZombies = config.zombies.map((z) => ({ id: z.id, nodo: z.nodo, tipo: z.tipo }));

  for (const zombie of config.zombies) {
    const { nuevoNodo, movioPasadoTurno } = moverZombie(
      zombie,
      config.grafo,
      config.aristasBloqueadas,
      config.sobrevivientes,
      config.aleatorio,
      turno,
    );
    zombie.nodo = nuevoNodo;
    zombie.movioPasadoTurno = movioPasadoTurno;
  }

  // -----------------------------------------------------------
  // Step 2: Apply city events scheduled for this turn.
  // -----------------------------------------------------------
  if (config.eventos) {
    for (const evento of config.eventos) {
      if (evento.turno === turno) {
        config.aristasBloqueadas = aplicarBloqueo(config.aristasBloqueadas, evento.calleId);
        if (evento.descripcion) {
          console.log(`[turno ${turno}] Evento: ${evento.descripcion} (${evento.calleId})`);
        }
      }
    }
  }

  // -----------------------------------------------------------
  // Step 3: Write TURNO#N with completo = false.
  // -----------------------------------------------------------
  const sobrevivientesAntesDeMoverse: Sobreviviente[] = config.sobrevivientes.map(
    (s) => ({ ...s }),
  );
  const zombiesActuales: Zombie[] = config.zombies.map((z) => ({ ...z }));

  const parcial: TurnoParcial = {
    turno,
    zombies: zombiesVisibles(zombiesActuales),
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
  // People riding a rescue van move with it: they never ask /paso.
  const activos = config.sobrevivientes.filter((s) => s.estado === "en_ruta" && !s.vehiculo);
  let respuestasValidas = 0;
  let respuestasFallidas = 0;

  const decisiones = new Map<string, string>();

  const consultarMotor = async (sobreviviente: Sobreviviente): Promise<void> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const respuesta = await Promise.race([
        config.motor.pedirPaso({
          sobrevivienteId: sobreviviente.id,
          nodoActual: sobreviviente.nodo,
          turno,
        }, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, PASO_TIMEOUT_MS);
        }),
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
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  await Promise.all(activos.map(consultarMotor));

  // -----------------------------------------------------------
  // Step 6: Move survivors, resolve bites, check arrivals, write completo = true.
  // -----------------------------------------------------------
  // Snapshot survivor positions BEFORE moving (for crossing-bite detection).
  const previoSobrevivientes = config.sobrevivientes.map((s) => ({ id: s.id, nodo: s.nodo }));

  // Apply movements.
  for (const sobreviviente of config.sobrevivientes) {
    if (sobreviviente.estado !== "en_ruta" || sobreviviente.vehiculo) continue;
    const siguienteNodo = decisiones.get(sobreviviente.id) ?? sobreviviente.nodo;
    sobreviviente.nodo = siguienteNodo;
    sobreviviente.siguienteNodo = siguienteNodo;
  }

  // Resolve bites (node sharing first, then crossings).
  resolverMordidasPorNodo(config.sobrevivientes, config.zombies);
  resolverMordidasPorCruce(
    config.sobrevivientes,
    previoSobrevivientes,
    config.zombies,
    previoZombies,
    config.grafo,
  );

  // Check shelter arrivals (after bites — a bitten survivor at a refuge is mordido).
  resolverLlegadas(config.sobrevivientes, config.nodosRefugio, config.capacidadRefugio);

  // Rescue fleet (Pro): vans move after everyone on foot, pick people up and drop them at shelters.
  let rescatadosFlota: number | undefined;
  if (config.flota) {
    const eventos = moverFlota(config.flota, {
      grafo: config.grafo,
      sobrevivientes: config.sobrevivientes,
      zombies: zombiesVisibles(config.zombies),
      aristasBloqueadas: config.aristasBloqueadas,
      nodosRefugio: config.nodosRefugio,
      capacidadRefugio: config.capacidadRefugio,
    });
    rescatadosFlota = eventos.filter((e) => e.tipo === "dejo").reduce((t, e) => t + e.sobrevivientes.length, 0);
  }

  // Only survivors still on the road get a next step; moves, bites and arrivals above are unchanged.
  let publicadas = decisiones;
  const planificar = config.planificarSiguiente;
  if (planificar) {
    publicadas = new Map(decisiones);
    for (const sobreviviente of config.sobrevivientes) {
      if (sobreviviente.estado !== "en_ruta") continue;
      // A rider's next step is wherever the van goes: no arrow of their own.
      sobreviviente.siguienteNodo = sobreviviente.vehiculo ? sobreviviente.nodo : planificar(sobreviviente);
      publicadas.set(sobreviviente.id, sobreviviente.siguienteNodo);
    }
  }

  await config.persistencia.completarTurno(turno, publicadas, config.sobrevivientes, config.flota);

  // -----------------------------------------------------------
  // Wait until the tick window is full.
  // -----------------------------------------------------------
  await config.reloj.esperarTick(iniciado, DURACION_TURNO_MS);

  const duracionMs = config.reloj.ahora() - iniciado;

  return {
    turno,
    respuestasValidas,
    respuestasFallidas,
    ...(rescatadosFlota !== undefined && { rescatadosFlota }),
    enRuta: config.sobrevivientes.filter((s) => s.estado === "en_ruta").length,
    aSalvo: config.sobrevivientes.filter((s) => s.estado === "a_salvo").length,
    mordidos: config.sobrevivientes.filter((s) => s.estado === "mordido").length,
    duracionMs,
  };
}

// -------------------------------------------------------------------------
// Round runner
// -------------------------------------------------------------------------

export interface ConfigRonda extends ConfigTurno {
  /** Defaults to true for existing local callers; official scenarios run all 150 turns. */
  detenerSinActivos?: boolean;
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

  for (let n = 1; n <= config.totalTurnos; n++) {
    if (config.signal?.aborted) break;

    const resultado = await ejecutarTurno(config, n);
    resultados.push(resultado);
    config.onTurno?.(resultado);

    // Stop early when no one is still moving.
    if (resultado.enRuta === 0 && config.detenerSinActivos !== false) break;
  }

  return resultados;
}
