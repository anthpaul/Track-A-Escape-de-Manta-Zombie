/**
 * Simulator Lambda — one scheduled demo round per invocation (S6, AGENTS.md §2).
 *
 * EventBridge Scheduler invokes it every few minutes so the public map is never
 * frozen (jury trap). Each invocation plays a whole 5-minute round, writing every
 * turn to DynamoDB with the same lock and fencing as `correr.ts --modo=http`:
 * if another round holds the lock (an evaluation, or a previous demo still
 * running) it exits without writing anything else.
 *
 * Event (all optional): { "ronda": 1 | 2 | 3, "semilla": number }. Default R2,
 * the round that shows every zombie type but sleepers plus a bridge collapse.
 * Environment: MUNDO_TABLE.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { DynamoPersistencia, type ClienteEscritura } from "./dynamo-persistencia";
import { crearMotorEnProceso, siguientePasoEnProceso } from "./motor-en-proceso";
import { correrRonda, type ConfigRonda } from "./turno";
import { relojReal, type Reloj } from "./reloj";

export type EventoDemo = { ronda?: unknown; semilla?: unknown };
export type ResultadoDemo =
  | { iniciada: false }
  | { iniciada: true; partidaId: string; ronda: 1 | 2 | 3; aSalvo: number; mordidos: number; enRuta: number };

export function parseEvento(evento: EventoDemo | null | undefined): { ronda: 1 | 2 | 3; semilla: number } {
  const ronda = evento?.ronda ?? 2;
  if (ronda !== 1 && ronda !== 2 && ronda !== 3) throw new Error("ronda must be 1, 2 or 3");
  const semilla = evento?.semilla ?? Math.floor(Math.random() * 0xffffffff);
  if (typeof semilla !== "number" || !Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    throw new Error("semilla must be an integer between 0 and 4294967295");
  }
  return { ronda, semilla };
}

export function crearHandler(deps: { cliente: ClienteEscritura; tabla: string; reloj?: Reloj }) {
  return async (evento: EventoDemo | null | undefined): Promise<ResultadoDemo> => {
    const { ronda, semilla } = parseEvento(evento);
    const crear = ronda === 1 ? crearEscenarioR1 : ronda === 2 ? crearEscenarioR2 : crearEscenarioR3;
    // The motor reads the live round config, which only exists once the scenario is built.
    let vivo: ConfigRonda | undefined;
    const motor = crearMotorEnProceso(() => vivo?.zombies ?? [], () => vivo?.aristasBloqueadas ?? []);
    const { config } = crear({ semilla, motor, reloj: deps.reloj ?? relojReal, modo: "demo" });
    vivo = config;
    // Publish each survivor's next step so the map draws its arrow; free here because the motor runs in process.
    config.planificarSiguiente = (s) =>
      siguientePasoEnProceso({ sobrevivienteId: s.id, nodoActual: s.nodo, turno: 0 }, config.zombies, config.aristasBloqueadas);

    const persistencia = new DynamoPersistencia(deps.cliente, deps.tabla, config.partidaId, ronda);
    if (!(await persistencia.iniciar(semilla))) return { iniciada: false };
    config.persistencia = persistencia;
    try {
      await correrRonda(config);
    } finally {
      await persistencia.cerrar();
    }

    const contar = (estado: string) => config.sobrevivientes.filter((s) => s.estado === estado).length;
    return { iniciada: true, partidaId: config.partidaId, ronda, aSalvo: contar("a_salvo"), mordidos: contar("mordido"), enRuta: contar("en_ruta") };
  };
}

// Created once per warm instance, like the API Lambda's clients.
const cliente = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = (evento: EventoDemo) => crearHandler({ cliente, tabla: process.env.MUNDO_TABLE ?? "" })(evento);
