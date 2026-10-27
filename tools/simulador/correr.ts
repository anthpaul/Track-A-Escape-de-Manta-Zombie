/**
 * CLI entry point for S4 round execution.
 *
 * Usage:
 *   node --import tsx tools/simulador/correr.ts --ronda=1 --semilla=42
 *   node --import tsx tools/simulador/correr.ts --ronda=2 --semilla=42 --modo=http
 *   node --import tsx tools/simulador/correr.ts --ronda=3 --semilla=42 --modo=http
 *
 * Environment variables (required for --modo=http):
 *   PASO_URL   — e.g. https://xxx.cloudfront.net/api/paso
 *   PASO_KEY   — value for x-api-key header
 *
 * Default mode (no --modo flag): uses the local fake motor (no AWS needed).
 *
 * Output: prints per-turn progress and final metrics table to stdout.
 *
 * Survivor arrival tracking: onTurno callback updates datosIniciales so the
 * efficiency metric knows which turn each survivor arrived.
 */
import { correrRonda } from "./turno";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { MotorHttp } from "./motor-http";
import { crearPersistenciaMemoria } from "./persistencia";
import { calcularMetricas, imprimirMetricas } from "./metricas";
import type { ResultadoTurno } from "./turno";
import { DynamoPersistencia } from "./dynamo-persistencia";

export const AYUDA = `Usage: node --import tsx tools/simulador/correr.ts [--ronda=1|2|3] [--semilla=42] [--modo=local|http]
Local mode uses an in-memory world and a fake motor, not AWS performance evidence.
HTTP mode requires PASO_URL, PASO_KEY, MUNDO_TABLE, AWS_REGION and AWS_PROFILE.
It publishes snapshots to DynamoDB and calls /paso. It refuses an occupied active-game lock.
Obtain team authorization and disable the demo Scheduler before evaluation; this CLI does not preempt games.
--help prints this help without starting a round.`;

// -------------------------------------------------------------------------
// Argument parsing
// -------------------------------------------------------------------------

export function parseArgs(args = process.argv.slice(2)): { ronda: 1 | 2 | 3; semilla: number; modo: "local" | "http" } {
  const seen = new Set<string>();
  for (const arg of args) {
    const match = /^--(ronda|semilla|modo)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1]!)) throw new Error("Unknown, empty or repeated option; use --help");
    seen.add(match[1]!);
  }
  const get = (key: string) => {
    const entry = args.find((a) => a.startsWith(`--${key}=`));
    return entry ? entry.split("=")[1] : undefined;
  };

  const rondaRaw = Number(get("ronda") ?? "1");
  if (![1, 2, 3].includes(rondaRaw)) {
    throw new Error("--ronda must be 1, 2 or 3");
  }

  const semilla = Number(get("semilla") ?? "42");
  if (!Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    throw new Error("--semilla must be an integer between 0 and 4294967295");
  }

  const modo = (get("modo") ?? "local") as "local" | "http";
  if (!["local", "http"].includes(modo)) {
    throw new Error("--modo must be 'local' or 'http'");
  }

  return { ronda: rondaRaw as 1 | 2 | 3, semilla, modo };
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

export async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log(AYUDA);
    return;
  }
  const { ronda, semilla, modo } = parseArgs();

  console.log(`\nRonda R${ronda} | semilla ${semilla} | motor ${modo}`);
  console.log("─".repeat(40));

  // Build motor.
  const motorHttp = modo === "http" ? new MotorHttp() : null;

  // Build scenario.
  const persistencia = crearPersistenciaMemoria();
  const crearEscenario = ronda === 1 ? crearEscenarioR1 : ronda === 2 ? crearEscenarioR2 : crearEscenarioR3;
  const escenario = crearEscenario({
    semilla,
    motor: motorHttp ?? undefined,
    persistencia,
  });

  const { config, datosIniciales, nodosRefugio } = escenario;
  let dynamo: DynamoPersistencia | undefined;
  let destruirCliente: (() => void) | undefined;
  if (modo === "http") {
    const table = process.env.MUNDO_TABLE;
    const region = process.env.AWS_REGION;
    const profile = process.env.AWS_PROFILE;
    if (!table || !region || !profile) throw new Error("HTTP mode requires MUNDO_TABLE, AWS_REGION and AWS_PROFILE");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const { fromIni } = await import("@aws-sdk/credential-provider-ini");
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials: fromIni({ profile }), maxAttempts: 1 }));
    destruirCliente = () => client.destroy();
    dynamo = new DynamoPersistencia(client, table, config.partidaId, ronda);
    if (!await dynamo.iniciar(semilla)) {
      console.log("Round not started: another game owns the active-game lock.");
      client.destroy();
      return;
    }
    config.persistencia = dynamo;
  }

  // Track arrival turns for efficiency calculation.
  const llegadas = new Map<string, number>(); // sobrevivienteId → turno

  // onTurno callback — log progress and record arrivals.
  const resultadosTurnos: ResultadoTurno[] = [];
  config.onTurno = (resultado) => {
    resultadosTurnos.push(resultado);
    // Record first-time arrivals.
    for (const s of config.sobrevivientes) {
      if (s.estado === "a_salvo" && !llegadas.has(s.id)) {
        llegadas.set(s.id, resultado.turno);
      }
    }
    // Print compact progress line.
    process.stdout.write(
      `\r  turno ${String(resultado.turno).padStart(3)}  en ruta ${String(resultado.enRuta).padStart(3)}  a salvo ${String(resultado.aSalvo).padStart(3)}  mordidos ${String(resultado.mordidos).padStart(3)}`,
    );
  };

  // Run.
  try {
    await correrRonda(config);
  } finally {
    try { await dynamo?.cerrar(); }
    finally { destruirCliente?.(); }
  }
  process.stdout.write("\n");

  // Apply arrival turns to datosIniciales.
  for (const dato of datosIniciales) {
    dato.turnoLlegada = llegadas.get(dato.id) ?? 0;
    const s = config.sobrevivientes.find((s) => s.id === dato.id);
    if (s) dato.estado = s.estado;
  }

  // Calculate and print metrics.
  const metricas = calcularMetricas({
    ronda,
    resultadosTurnos,
    latencias: motorHttp?.latencias ?? [],
    sobrevivientes: config.sobrevivientes,
    datosIniciales,
    grafo: config.grafo,
    nodosRefugio,
  });

  imprimirMetricas(metricas);
}

if (require.main === module) {
  main().catch(() => {
    // Do not print SDK/fetch diagnostics that could contain request URLs or credentials.
    console.error("Round failed. Check configuration, active-game ownership and service availability. Use --help for usage.");
    process.exitCode = 1;
  });
}
