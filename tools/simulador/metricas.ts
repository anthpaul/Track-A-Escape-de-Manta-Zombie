/**
 * Round metrics — S4 measurement (AGENTS.md §9 Fase 2 / HOJA_DE_RUTA §3).
 *
 * Calculates and formats:
 *   - Living fraction (active + rescued) and rescued fraction separately
 *   - Efficiency   (actual turns vs. BFS optimal turns, per survivor)
 *   - Latency      (p50 / p95 / p99 of all /paso response times)
 *   - Error rate   (invalid moves + timeouts over total /paso calls)
 */
import type { Sobreviviente } from "@abcstack/shared";
import type { GrafoIndexado } from "@abcstack/shared";
import type { ResultadoTurno } from "./turno";

// -------------------------------------------------------------------------
// Percentile helper
// -------------------------------------------------------------------------

/** Return the p-th percentile (0–100) of a sorted array of numbers. */
function percentil(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

// -------------------------------------------------------------------------
// BFS shortest hop distance (for efficiency calculation)
// -------------------------------------------------------------------------

function hopsBFS(grafo: GrafoIndexado, origen: string, destinos: ReadonlySet<string>): number {
  if (destinos.has(origen)) return 0;
  const visitado = new Set([origen]);
  const cola: Array<{ nodo: string; pasos: number }> = [{ nodo: origen, pasos: 0 }];
  for (let i = 0; i < cola.length; i++) {
    const { nodo, pasos } = cola[i]!;
    for (const vecino of grafo.vecinos(nodo)) {
      if (destinos.has(vecino)) return pasos + 1;
      if (!visitado.has(vecino)) {
        visitado.add(vecino);
        cola.push({ nodo: vecino, pasos: pasos + 1 });
      }
    }
  }
  return Infinity;
}

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export interface MetricasRonda {
  ronda: 1 | 2 | 3;
  totalSobrevivientes: number;
  aSalvo: number;
  mordidos: number;
  enRuta: number;               // still active when round ended (time limit)
  supervivencia: number;        // (aSalvo + enRuta) / total, 0–1; not an official scoring formula
  vivos: number;
  rescatados: number;
  /** Average ratio actual_turns / optimal_turns for survivors that reached a shelter.
   *  1.0 = perfect efficiency. Higher = took more turns than the BFS minimum. */
  eficienciaPromedio: number | null;
  latenciaP50Ms: number | null;
  latenciaP95Ms: number | null;
  latenciaP99Ms: number | null;
  totalLlamadas: number;
  errores: number;              // invalid moves + timeouts
  tasaError: number;            // errores / totalLlamadas, 0–1
  turnosEjecutados: number;
  duracionTotalMs: number;
}

export interface DatosSobreviviente {
  id: string;
  /** Node where the survivor started the round. */
  nodoInicial: string;
  /** Final state after the round. */
  estado: Sobreviviente["estado"];
  /** Turn on which they arrived (1-indexed). 0 if they never arrived. */
  turnoLlegada: number;
}

// -------------------------------------------------------------------------
// Main function
// -------------------------------------------------------------------------

export function calcularMetricas(opts: {
  ronda: 1 | 2 | 3;
  resultadosTurnos: ResultadoTurno[];
  latencias: number[];           // one entry per /paso call, in ms
  sobrevivientes: readonly Sobreviviente[];
  datosIniciales: readonly DatosSobreviviente[];
  grafo: GrafoIndexado;
  nodosRefugio: ReadonlySet<string>;
}): MetricasRonda {
  const { ronda, resultadosTurnos, latencias, sobrevivientes, datosIniciales, grafo, nodosRefugio } = opts;

  const total = datosIniciales.length;
  const aSalvo = sobrevivientes.filter((s) => s.estado === "a_salvo").length;
  const mordidos = sobrevivientes.filter((s) => s.estado === "mordido").length;
  const enRuta = sobrevivientes.filter((s) => s.estado === "en_ruta").length;

  // Efficiency: for each survivor that arrived, compare actual turns to BFS optimal.
  const ratiosEficiencia: number[] = [];
  for (const inicial of datosIniciales) {
    const datos = inicial;
    if (datos.turnoLlegada === 0) continue;           // did not arrive
    const optimo = hopsBFS(grafo, datos.nodoInicial, nodosRefugio);
    if (optimo === 0 || optimo === Infinity) continue; // already at refuge or unreachable
    ratiosEficiencia.push(datos.turnoLlegada / optimo);
  }
  const eficienciaPromedio =
    ratiosEficiencia.length > 0
      ? ratiosEficiencia.reduce((a, b) => a + b, 0) / ratiosEficiencia.length
      : null;

  // Latency percentiles.
  const sortedLatencias = [...latencias].sort((a, b) => a - b);
  const latenciaP50Ms = percentil(sortedLatencias, 50);
  const latenciaP95Ms = percentil(sortedLatencias, 95);
  const latenciaP99Ms = percentil(sortedLatencias, 99);

  // Error rate: sum of respuestasFallidas across all turns.
  const totalLlamadas = resultadosTurnos.reduce(
    (acc, r) => acc + r.respuestasValidas + r.respuestasFallidas,
    0,
  );
  const errores = resultadosTurnos.reduce((acc, r) => acc + r.respuestasFallidas, 0);
  const tasaError = totalLlamadas > 0 ? errores / totalLlamadas : 0;

  const duracionTotalMs = resultadosTurnos.reduce((acc, r) => acc + r.duracionMs, 0);

  return {
    ronda,
    totalSobrevivientes: total,
    aSalvo,
    mordidos,
    enRuta,
    supervivencia: total > 0 ? (aSalvo + enRuta) / total : 0,
    vivos: aSalvo + enRuta,
    rescatados: total > 0 ? aSalvo / total : 0,
    eficienciaPromedio,
    latenciaP50Ms: latencias.length ? latenciaP50Ms : null,
    latenciaP95Ms: latencias.length ? latenciaP95Ms : null,
    latenciaP99Ms: latencias.length ? latenciaP99Ms : null,
    totalLlamadas,
    errores,
    tasaError,
    turnosEjecutados: resultadosTurnos.length,
    duracionTotalMs,
  };
}

// -------------------------------------------------------------------------
// Console reporter
// -------------------------------------------------------------------------

export function imprimirMetricas(m: MetricasRonda): void {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const ms = (n: number | null) => n === null ? "not measured (local fake motor)" : `${n.toFixed(1)} ms`;

  console.log(`\n${"═".repeat(52)}`);
  console.log(`  RONDA R${m.ronda} — ${m.turnosEjecutados} turnos (${(m.duracionTotalMs / 1000).toFixed(1)} s)`);
  console.log(`${"═".repeat(52)}`);
  console.log(`  Supervivientes   ${m.totalSobrevivientes}`);
  console.log(`  Vivos            ${m.vivos}  (${pct(m.supervivencia)})`);
  console.log(`  A salvo          ${m.aSalvo}  (${pct(m.rescatados)})`);
  console.log(`  Mordidos         ${m.mordidos}`);
  console.log(`  En ruta (fin)    ${m.enRuta}`);
  if (m.eficienciaPromedio !== null) {
    console.log(`  Eficiencia       ${m.eficienciaPromedio.toFixed(2)}x óptimo`);
  }
  console.log(`  Latencia p50     ${ms(m.latenciaP50Ms)}`);
  console.log(`  Latencia p95     ${ms(m.latenciaP95Ms)}${m.latenciaP95Ms !== null && m.latenciaP95Ms > 150 ? "  >150 ms" : ""}`);
  console.log(`  Latencia p99     ${ms(m.latenciaP99Ms)}`);
  console.log(`  Llamadas /paso   ${m.totalLlamadas}`);
  console.log(`  Errores/timeout  ${m.errores}  (${pct(m.tasaError)})${m.tasaError > 0.005 ? "  ← >0.5%!" : ""}`);
  console.log(`${"═".repeat(52)}\n`);
}
