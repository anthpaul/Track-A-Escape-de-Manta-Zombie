/**
 * Warm-up antes de una ronda: despierta suficientes instancias de Lambda para la ráfaga de la R3.
 *
 * En la R3 el simulador manda ~200 POST /paso en la misma ventana de 500 ms. Cada
 * instancia que Lambda tiene que crear para esa ráfaga paga un arranque en frío, lo que
 * empeora el p95 (15 %) y puede llevar llamadas por encima de 500 ms (disponibilidad, 15 %).
 * Disparar la misma ráfaga unas cuantas veces justo antes de la ronda deja esas instancias
 * calientes.
 *
 * Uso (mismas PASO_URL / PASO_KEY que `correr.ts --modo=http`):
 *   node --import tsx tools/simulador/calentar.ts [--concurrencia=200] [--oleadas=3] [--pausa=1000]
 *
 * Solo llama a /paso, que nunca escribe en DynamoDB; sin una partida activa el motor
 * responde su paso seguro de respaldo, que igual recorre el arranque en frío completo.
 */
import { MotorHttp } from "./motor-http";
import { percentil } from "./metricas";
import type { ClienteMotor } from "./motor-falso";

// Tramo oficial de latencia para el mejor puntaje (p95 ≤ 150 ms).
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
    // Todos los pedidos de una oleada arrancan juntos: esa concurrencia es la que hace que Lambda cree instancias.
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

/** Listo cuando la última oleada, ya caliente, cumple el mejor tramo de latencia sin errores. */
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
    // Los pedidos fallidos se cuentan por oleada y nunca llegan acá; lo que sí llega es un error
    // de uso o de configuración, cuyo mensaje no incluye la URL ni la key.
    console.error(error instanceof Error ? error.message : "Warm-up failed. Use --help for usage.");
    process.exitCode = 1;
  });
}
