/**
 * Simulator Lambda — one round per invocation: scheduled demos (S6, AGENTS.md §2) and the
 * fire-test evaluation rounds.
 *
 * EventBridge Scheduler invokes it every few minutes so the public map is never
 * frozen (jury trap). Each invocation plays a whole 5-minute round, writing every
 * turn to DynamoDB with the same lock and fencing as `correr.ts --modo=http`:
 * if another round holds the lock (an evaluation, or a previous demo still
 * running) it exits without writing anything else.
 *
 * Event (all optional): { "ronda": 1 | 2 | 3, "semilla": number, "modo": "demo" | "evaluacion", "flota": boolean }.
 * The rescue fleet (Pro) rides in demo rounds by default and never in evaluation unless asked.
 *
 * Demo rounds chain: when one ends (often early, once nobody is on the road) the same invocation starts
 * the next one right away while it still has time for a full round, so the public map waits ~2 s
 * between rounds instead of up to a minute for the next schedule. Evaluation rounds never chain.
 * Default R2 demo, the round that shows every zombie type but sleepers plus a bridge collapse.
 *
 * Evaluation mode (`aws lambda invoke` with "modo": "evaluacion") calls the real POST /paso over
 * HTTP from the same region, so the measured latency is the service's and not the operator's
 * internet. It warms the API Lambda first (simultaneous waves as large as the round, on a motor of
 * their own so those latencies never mix with the round's), plays all 150 turns and returns the
 * warm-up waves and the round metrics. Warm-up requests wait up to 3 s: a new API instance needs
 * more than 500 ms to boot and open its DynamoDB connection, and cutting it earlier only makes the
 * next wave ask for yet another cold instance.
 *
 * Environment: MUNDO_TABLE; PASO_URL and PASO_KEY for evaluation rounds.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { DynamoPersistencia, type ClienteEscritura } from "./dynamo-persistencia";
import { crearMotorEnProceso, siguientePasoEnProceso } from "./motor-en-proceso";
import { correrRonda, type ConfigRonda, type ResultadoTurno } from "./turno";
import { relojReal, type Reloj } from "./reloj";
import { MotorHttp, type OpcionesMotorHttp } from "./motor-http";
import { calentar, type ResultadoOleada } from "./calentar";
import { calcularMetricas, p95DeLatencias, type MetricasRonda } from "./metricas";
import type { ClienteMotor } from "./motor-falso";

export type EventoDemo = { ronda?: unknown; semilla?: unknown; modo?: unknown; flota?: unknown };
export type Modo = "demo" | "evaluacion";
export type ResultadoDemo =
  | { iniciada: false }
  | {
      iniciada: true;
      partidaId: string;
      ronda: 1 | 2 | 3;
      modo: Modo;
      aSalvo: number;
      mordidos: number;
      enRuta: number;
      // Rounds this invocation played (demo rounds chain; the result describes the last one).
      rondasJugadas?: number;
      // Rounds with the rescue fleet only.
      rescatadosFlota?: number;
      // Evaluation rounds only.
      calentamiento?: ResultadoOleada[];
      metricas?: MetricasRonda;
    };

/** The HTTP motor of an evaluation round: answers /paso and records one latency per call. */
export type MotorMedido = ClienteMotor & { readonly latencias: number[] };

export function parseEvento(evento: EventoDemo | null | undefined): { ronda: 1 | 2 | 3; semilla: number; modo: Modo; flota: boolean } {
  const ronda = evento?.ronda ?? 2;
  if (ronda !== 1 && ronda !== 2 && ronda !== 3) throw new Error("ronda must be 1, 2 or 3");
  const semilla = evento?.semilla ?? Math.floor(Math.random() * 0xffffffff);
  if (typeof semilla !== "number" || !Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    throw new Error("semilla must be an integer between 0 and 4294967295");
  }
  const modo = evento?.modo ?? "demo";
  if (modo !== "demo" && modo !== "evaluacion") throw new Error("modo must be 'demo' or 'evaluacion'");
  const flota = evento?.flota ?? modo === "demo";
  if (typeof flota !== "boolean") throw new Error("flota must be true or false");
  return { ronda, semilla, modo, flota };
}

export function crearHandler(deps: {
  cliente: ClienteEscritura;
  tabla: string;
  reloj?: Reloj;
  // Evaluation rounds: one call per motor (the round, then the warm-up). Defaults to POST /paso from PASO_URL / PASO_KEY.
  crearMotorHttp?: (opciones?: Pick<OpcionesMotorHttp, "timeoutMs">) => MotorMedido;
  pausaCalentamientoMs?: number;
  // Milliseconds this invocation has left (Lambda context). Without it, demo rounds do not chain.
  tiempoRestanteMs?: () => number;
}) {
  const jugar = async (ronda: 1 | 2 | 3, semilla: number, modo: Modo, flota: boolean): Promise<ResultadoDemo> => {
    const crear = ronda === 1 ? crearEscenarioR1 : ronda === 2 ? crearEscenarioR2 : crearEscenarioR3;
    const crearMotorHttp = deps.crearMotorHttp ?? ((opciones) => new MotorHttp(opciones));
    // Built before anything is written, so a missing PASO_URL / PASO_KEY fails without touching the lock.
    const motorHttp = modo === "evaluacion" ? crearMotorHttp() : undefined;
    // The demo motor reads the live round config, which only exists once the scenario is built.
    let vivo: ConfigRonda | undefined;
    const motor =
      motorHttp ??
      crearMotorEnProceso(() => vivo?.zombies ?? [], () => vivo?.aristasBloqueadas ?? [], () => vivo?.sobrevivientes ?? []);
    const escenario = crear({ semilla, motor, reloj: deps.reloj ?? relojReal, modo, flota });
    const { config } = escenario;
    vivo = config;
    // Publish each survivor's next step so the map draws its arrow; free here because the motor runs in process.
    config.planificarSiguiente = (s) =>
      siguientePasoEnProceso(
        { sobrevivienteId: s.id, nodoActual: s.nodo, turno: 0 },
        config.zombies,
        config.aristasBloqueadas,
        config.sobrevivientes,
      );

    const persistencia = new DynamoPersistencia(deps.cliente, deps.tabla, config.partidaId, ronda);
    // The map panel shows the live /paso p95 of evaluation rounds (AGENTS.md §5 metricas.p95ms).
    if (motorHttp) persistencia.medirP95 = () => p95DeLatencias(motorHttp.latencias);
    if (!(await persistencia.iniciar(semilla))) return { iniciada: false };
    config.persistencia = persistencia;

    // Arrival turn of each survivor and every turn result, for the efficiency and error metrics.
    const llegadas = new Map<string, number>();
    const turnos: ResultadoTurno[] = [];
    let rescatadosFlota = 0;
    config.onTurno = (resultado) => {
      turnos.push(resultado);
      rescatadosFlota += resultado.rescatadosFlota ?? 0;
      for (const s of config.sobrevivientes) if (s.estado === "a_salvo" && !llegadas.has(s.id)) llegadas.set(s.id, resultado.turno);
    };

    let calentamiento: ResultadoOleada[] | undefined;
    try {
      if (motorHttp) {
        // Wake as many API instances as the round will hit at once, before turn 1 counts.
        calentamiento = await calentar({
          motor: crearMotorHttp({ timeoutMs: 3000 }),
          concurrencia: config.sobrevivientes.length,
          oleadas: 4,
          pausaMs: deps.pausaCalentamientoMs ?? 2000,
          nodo: config.sobrevivientes[0]!.nodo,
        });
      }
      await correrRonda(config);
    } finally {
      await persistencia.cerrar();
    }

    const contar = (estado: string) => config.sobrevivientes.filter((s) => s.estado === estado).length;
    const base = {
      iniciada: true as const,
      partidaId: config.partidaId,
      ronda,
      modo,
      aSalvo: contar("a_salvo"),
      mordidos: contar("mordido"),
      enRuta: contar("en_ruta"),
      ...(flota && { rescatadosFlota }),
    };
    if (!motorHttp) return base;

    for (const dato of escenario.datosIniciales) {
      dato.turnoLlegada = llegadas.get(dato.id) ?? 0;
      const s = config.sobrevivientes.find((x) => x.id === dato.id);
      if (s) dato.estado = s.estado;
    }
    const metricas = calcularMetricas({
      ronda,
      resultadosTurnos: turnos,
      latencias: motorHttp.latencias,
      sobrevivientes: config.sobrevivientes,
      datosIniciales: escenario.datosIniciales,
      grafo: config.grafo,
      nodosRefugio: escenario.nodosRefugio,
    });
    return { ...base, calentamiento, metricas };
  };

  return async (evento: EventoDemo | null | undefined): Promise<ResultadoDemo> => {
    const { ronda, semilla, modo, flota } = parseEvento(evento);
    let ultimo = await jugar(ronda, semilla, modo, flota);
    if (!ultimo.iniciada) return ultimo;
    let rondasJugadas = 1;
    // A demo round lasts at most 150 turns of 2 s: chain only while a whole one still fits.
    while (modo === "demo" && deps.tiempoRestanteMs && deps.tiempoRestanteMs() >= MARGEN_RONDA_MS) {
      const siguiente = await jugar(ronda, (semilla + rondasJugadas) % 0x100000000, modo, flota);
      if (!siguiente.iniciada) break; // another round took the lock in between: it shows on the map instead
      ultimo = siguiente;
      rondasJugadas++;
    }
    return { ...ultimo, rondasJugadas };
  };
}

// 150 turns × 2 s plus writes and a safety margin, against the 15-minute Lambda timeout.
const MARGEN_RONDA_MS = 330_000;

// Created once per warm instance, like the API Lambda's clients.
const cliente = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = (evento: EventoDemo, contexto?: { getRemainingTimeInMillis(): number }) =>
  crearHandler({
    cliente,
    tabla: process.env.MUNDO_TABLE ?? "",
    tiempoRestanteMs: contexto ? () => contexto.getRemainingTimeInMillis() : undefined,
  })(evento);
