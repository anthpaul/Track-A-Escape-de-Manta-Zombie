/**
 * Warm-up before a round: wakes enough Lambda instances for the R3 burst.
 *
 * In R3 the simulator sends ~200 POST /paso in the same 500 ms window. Every
 * instance Lambda has to create for that burst pays a cold start, which hurts
 * the p95 (15 %) and can push calls past 500 ms (availability, 15 %). Firing
 * the same burst a few times right before the round leaves those instances warm.
 *
 * Usage (same PASO_URL / PASO_KEY as `correr.ts --modo=http`):
 *   node --import tsx tools/simulador/calentar.ts [--concurrencia=200] [--oleadas=3] [--pausa=1000]
 *
 * It only calls /paso, which never writes to DynamoDB; with no active game the
 * motor answers its safe fallback, which still runs the full cold start.
 */
import { MotorHttp } from "./motor-http";
import { percentil } from "./metricas";
import type { ClienteMotor } from "./motor-falso";

// Official latency tier for the best score (p95 ≤ 150 ms).
const P95_OBJETIVO_MS = 150;

export interface ResultadoOleada {
  oleada: number;
  pedidos: number;
  errores: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export async function calentar(opts: {
  motor: ClienteMotor;
  concurrencia: number;
  oleadas: number;
  pausaMs: number;
  nodo: string;
}): Promise<ResultadoOleada[]> {
  const resultados: ResultadoOleada[] = [];
  for (let oleada = 1; oleada <= opts.oleadas; oleada++) {
    const latencias: number[] = [];
    let errores = 0;
    // All requests of a wave start together: that concurrency is what makes Lambda create instances.
    await Promise.all(
      Array.from({ length: opts.concurrencia }, async (_, i) => {
        const inicio = performance.now();
        try {
          await opts.motor.pedirPaso({ sobrevivienteId: `S-${String(i + 1).padStart(4, "0")}`, nodoActual: opts.nodo, turno: 0 });
        } catch {
          errores++;
        } finally {
          latencias.push(performance.now() - inicio);
        }
      }),
    );
    latencias.sort((a, b) => a - b);
    resultados.push({
      oleada,
      pedidos: opts.concurrencia,
      errores,
      p50Ms: percentil(latencias, 50),
      p95Ms: percentil(latencias, 95),
      maxMs: latencias.at(-1) ?? 0,
    });
    if (oleada < opts.oleadas) await new Promise((r) => setTimeout(r, opts.pausaMs));
  }
  return resultados;
}

/** Ready when the last wave, already warm, meets the best latency tier with no errors. */
export function veredicto(oleadas: readonly ResultadoOleada[]): { listo: boolean; motivo: string } {
  const ultima = oleadas.at(-1);
  if (!ultima) return { listo: false, motivo: "no wave ran" };
  if (ultima.errores > 0) return { listo: false, motivo: `${ultima.errores} errors or timeouts in the last wave` };
  if (ultima.p95Ms > P95_OBJETIVO_MS) return { listo: false, motivo: `last wave p95 ${Math.round(ultima.p95Ms)} ms > ${P95_OBJETIVO_MS} ms` };
  return { listo: true, motivo: `last wave p95 ${Math.round(ultima.p95Ms)} ms with no errors` };
}

export function parseArgsCalentar(args = process.argv.slice(2)): { concurrencia: number; oleadas: number; pausaMs: number } {
  const valores: Record<string, number> = { concurrencia: 200, oleadas: 3, pausa: 1000 };
  const vistos = new Set<string>();
  for (const arg of args) {
    const match = /^--(concurrencia|oleadas|pausa)=(\d+)$/.exec(arg);
    if (!match || vistos.has(match[1]!)) throw new Error("Unknown, invalid or repeated option; use --help");
    vistos.add(match[1]!);
    valores[match[1]!] = Number(match[2]);
  }
  if (valores.concurrencia! < 1 || valores.oleadas! < 1) throw new Error("--concurrencia and --oleadas must be at least 1");
  return { concurrencia: valores.concurrencia!, oleadas: valores.oleadas!, pausaMs: valores.pausa! };
}

export const AYUDA_CALENTAR = `Usage: node --import tsx tools/simulador/calentar.ts [--concurrencia=200] [--oleadas=3] [--pausa=1000]
Fires bursts of POST /paso (PASO_URL, PASO_KEY) to warm Lambda instances before a round.
Exit code 0 when the last wave has no errors and p95 <= ${P95_OBJETIVO_MS} ms, 1 otherwise.`;

async function main() {
  if (process.argv[2] === "--help") return console.log(AYUDA_CALENTAR);
  const { concurrencia, oleadas, pausaMs } = parseArgsCalentar();
  const { default: grafo } = await import("../../shared/data/manta.json");
  const resultados = await calentar({ motor: new MotorHttp(), concurrencia, oleadas, pausaMs, nodo: grafo.nodos[0]!.id });
  for (const r of resultados) {
    console.log(`oleada ${r.oleada}: ${r.pedidos} pedidos · errores ${r.errores} · p50 ${Math.round(r.p50Ms)} ms · p95 ${Math.round(r.p95Ms)} ms · max ${Math.round(r.maxMs)} ms`);
  }
  const { listo, motivo } = veredicto(resultados);
  console.log(listo ? `LISTO: ${motivo}` : `NO LISTO: ${motivo}`);
  process.exitCode = listo ? 0 : 1;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // Never print request details: they could include the URL or the key.
    console.error(error instanceof Error && error.message.includes("required") ? error.message : "Warm-up failed. Check PASO_URL, PASO_KEY and service availability.");
    process.exitCode = 1;
  });
}
