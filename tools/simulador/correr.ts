/**
 * Punto de entrada CLI para ejecutar las rondas de S4.
 *
 * Uso:
 *   node --import tsx tools/simulador/correr.ts --ronda=1 --semilla=42
 *   node --import tsx tools/simulador/correr.ts --ronda=2 --semilla=42 --modo=http
 *   node --import tsx tools/simulador/correr.ts --ronda=3 --semilla=42 --modo=http
 *
 * Variables de entorno (obligatorias con --modo=http):
 *   PASO_URL   — por ejemplo https://xxx.cloudfront.net/api/paso
 *   PASO_KEY   — valor de la cabecera x-api-key
 *
 * Modo por defecto (sin --modo): usa el motor falso local (no necesita AWS).
 *
 * Salida: imprime en stdout el progreso de cada turno y la tabla final de métricas.
 *
 * Seguimiento de llegadas: el callback onTurno actualiza datosIniciales para que
 * la métrica de eficiencia sepa en qué turno llegó cada sobreviviente.
 */
import { correrRonda } from "./turno";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { MotorHttp } from "./motor-http";
import { crearPersistenciaMemoria } from "./persistencia";
import { calcularMetricas, imprimirMetricas, p95DeLatencias } from "./metricas";
import type { ResultadoTurno } from "./turno";
import { DynamoPersistencia } from "./dynamo-persistencia";

export const AYUDA = `Usage: node --import tsx tools/simulador/correr.ts [--ronda=1|2|3] [--semilla=42] [--modo=local|http]
Local mode uses an in-memory world and a fake motor, not AWS performance evidence.
HTTP mode requires PASO_URL, PASO_KEY, MUNDO_TABLE, AWS_REGION and AWS_PROFILE.
It publishes snapshots to DynamoDB and calls /paso. It refuses an occupied active-game lock.
Obtain team authorization and disable the demo Scheduler before evaluation; this CLI does not preempt games.
--help prints this help without starting a round.`;

// -------------------------------------------------------------------------
// Lectura de argumentos
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
// Principal
// -------------------------------------------------------------------------

export async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log(AYUDA);
    return;
  }
  const { ronda, semilla, modo } = parseArgs();

  console.log(`\nRonda R${ronda} | semilla ${semilla} | motor ${modo}`);
  console.log("─".repeat(40));

  // Construye el motor.
  const motorHttp = modo === "http" ? new MotorHttp() : null;

  // Construye el escenario.
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
    // Publica el p95 en vivo de /paso que muestra el panel del mapa (AGENTS.md §5 metricas.p95ms).
    const latencias = motorHttp!.latencias;
    dynamo.medirP95 = () => p95DeLatencias(latencias);
    if (!await dynamo.iniciar(semilla)) {
      console.log("Round not started: another game owns the active-game lock.");
      client.destroy();
      return;
    }
    config.persistencia = dynamo;
  }

  // Registra los turnos de llegada para calcular la eficiencia.
  const llegadas = new Map<string, number>(); // sobrevivienteId → turno

  // Callback onTurno: muestra el progreso y registra las llegadas.
  const resultadosTurnos: ResultadoTurno[] = [];
  config.onTurno = (resultado) => {
    resultadosTurnos.push(resultado);
    // Registra las llegadas nuevas.
    for (const s of config.sobrevivientes) {
      if (s.estado === "a_salvo" && !llegadas.has(s.id)) {
        llegadas.set(s.id, resultado.turno);
      }
    }
    // Imprime una línea compacta de progreso.
    process.stdout.write(
      `\r  turno ${String(resultado.turno).padStart(3)}  en ruta ${String(resultado.enRuta).padStart(3)}  a salvo ${String(resultado.aSalvo).padStart(3)}  mordidos ${String(resultado.mordidos).padStart(3)}`,
    );
  };

  // Ejecuta.
  try {
    await correrRonda(config);
  } finally {
    try { await dynamo?.cerrar(); }
    finally { destruirCliente?.(); }
  }
  process.stdout.write("\n");

  // Aplica los turnos de llegada a datosIniciales.
  for (const dato of datosIniciales) {
    dato.turnoLlegada = llegadas.get(dato.id) ?? 0;
    const s = config.sobrevivientes.find((s) => s.id === dato.id);
    if (s) dato.estado = s.estado;
  }

  // Calcula e imprime las métricas.
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
    // No imprime diagnósticos del SDK o de fetch que podrían contener URLs de pedidos o credenciales.
    console.error("Round failed. Check configuration, active-game ownership and service availability. Use --help for usage.");
    process.exitCode = 1;
  });
}
