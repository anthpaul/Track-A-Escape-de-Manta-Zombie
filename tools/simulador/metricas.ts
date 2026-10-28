/**
 * Métricas de ronda — medición de S4 (AGENTS.md §9 Fase 2 / HOJA_DE_RUTA §3).
 *
 * Calcula y formatea:
 *   - Fracción de vivos (activos + rescatados) y, por separado, fracción de rescatados
 *   - Eficiencia     (turnos reales frente a turnos óptimos por BFS, por sobreviviente)
 *   - Latencia       (p50 / p95 / p99 de todos los tiempos de respuesta de /paso)
 *   - Tasa de error  (movimientos inválidos + timeouts sobre el total de llamadas a /paso)
 */
import type { Sobreviviente } from "@abcstack/shared";
import type { GrafoIndexado } from "@abcstack/shared";
import type { ResultadoTurno } from "./turno";

// -------------------------------------------------------------------------
// Helper de percentiles
// -------------------------------------------------------------------------

/** p95 en vivo de las latencias de /paso de la ronda hasta ahora (sin ordenar), o null antes de la primera llamada. */
export function p95DeLatencias(latencias: readonly number[]): number | null {
  if (latencias.length === 0) return null;
  return percentil([...latencias].sort((a, b) => a - b), 95);
}

/** Devuelve el percentil p (0–100) de un arreglo de números ordenado. */
export function percentil(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

// -------------------------------------------------------------------------
// Distancia mínima en saltos por BFS (para calcular la eficiencia)
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
// Tipos públicos
// -------------------------------------------------------------------------

export interface MetricasRonda {
  ronda: 1 | 2 | 3;
  totalSobrevivientes: number;
  aSalvo: number;
  mordidos: number;
  enRuta: number;               // seguía activo cuando terminó la ronda (límite de tiempo)
  supervivencia: number;        // (aSalvo + enRuta) / total, 0–1; no es una fórmula oficial de puntaje
  vivos: number;
  rescatados: number;
  /** Promedio de turnos_reales / turnos_óptimos de los sobrevivientes que llegaron a un refugio.
   *  1.0 = eficiencia perfecta. Mayor = tardó más turnos que el mínimo por BFS. */
  eficienciaPromedio: number | null;
  latenciaP50Ms: number | null;
  latenciaP95Ms: number | null;
  latenciaP99Ms: number | null;
  totalLlamadas: number;
  errores: number;              // movimientos inválidos + timeouts
  tasaError: number;            // errores / totalLlamadas, 0–1
  turnosEjecutados: number;
  duracionTotalMs: number;
}

export interface DatosSobreviviente {
  id: string;
  /** Nodo donde el sobreviviente empezó la ronda. */
  nodoInicial: string;
  /** Estado final después de la ronda. */
  estado: Sobreviviente["estado"];
  /** Turno en el que llegó (empieza en 1). 0 si nunca llegó. */
  turnoLlegada: number;
}

// -------------------------------------------------------------------------
// Función principal
// -------------------------------------------------------------------------

export function calcularMetricas(opts: {
  ronda: 1 | 2 | 3;
  resultadosTurnos: ResultadoTurno[];
  latencias: number[];           // una entrada por cada llamada a /paso, en ms
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

  // Eficiencia: por cada sobreviviente que llegó, compara los turnos reales con el óptimo por BFS.
  const ratiosEficiencia: number[] = [];
  for (const inicial of datosIniciales) {
    const datos = inicial;
    if (datos.turnoLlegada === 0) continue;           // no llegó
    const optimo = hopsBFS(grafo, datos.nodoInicial, nodosRefugio);
    if (optimo === 0 || optimo === Infinity) continue; // ya estaba en el refugio o es inalcanzable
    ratiosEficiencia.push(datos.turnoLlegada / optimo);
  }
  const eficienciaPromedio =
    ratiosEficiencia.length > 0
      ? ratiosEficiencia.reduce((a, b) => a + b, 0) / ratiosEficiencia.length
      : null;

  // Percentiles de latencia.
  const sortedLatencias = [...latencias].sort((a, b) => a - b);
  const latenciaP50Ms = percentil(sortedLatencias, 50);
  const latenciaP95Ms = percentil(sortedLatencias, 95);
  const latenciaP99Ms = percentil(sortedLatencias, 99);

  // Tasa de error: suma de respuestasFallidas en todos los turnos.
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
// Reporte por consola
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
