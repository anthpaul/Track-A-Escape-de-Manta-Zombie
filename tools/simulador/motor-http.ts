/**
 * Cliente HTTP del motor: llama al POST /api/paso real en AWS.
 *
 * Reemplazo directo de motor-falso.ts una vez desplegado el backend.
 *
 * Configuración (por variables de entorno u opciones del constructor):
 *   PASO_URL   — URL completa, por ejemplo https://xxx.cloudfront.net/api/paso
 *   PASO_KEY   — valor de la cabecera x-api-key
 *
 * Registro de latencias:
 *   Cada llamada agrega su duración de reloj (ms) a `latencias`.
 *   El runner de la ronda lee este arreglo para calcular p50/p95/p99.
 *   Incluye el parseo del cuerpo de la respuesta y los fallos, con exactamente una muestra por llamada.
 */
import type { ClienteMotor, PedidoPaso, RespuestaPaso } from "./motor-falso";

export interface OpcionesMotorHttp {
  url?: string;
  apiKey?: string;
  /** Corte del pedido en ms. Por defecto, los 500 ms oficiales; solo un warm-up debería esperar más. */
  timeoutMs?: number;
}

export class MotorHttp implements ClienteMotor {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  /** Tiempos de respuesta registrados en ms, uno por cada llamada a /paso. */
  readonly latencias: number[] = [];

  constructor(opts: OpcionesMotorHttp = {}) {
    this.url = opts.url ?? process.env.PASO_URL ?? "";
    this.apiKey = opts.apiKey ?? process.env.PASO_KEY ?? "";
    this.timeoutMs = opts.timeoutMs ?? 500;
    if (!this.url) throw new Error("PASO_URL is required (env var or constructor option)");
    if (!this.apiKey) throw new Error("PASO_KEY is required (env var or constructor option)");
  }

  async pedirPaso(pedido: PedidoPaso, signal?: AbortSignal): Promise<RespuestaPaso> {
    const inicio = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(pedido),
        // Tanto las llamadas sueltas como el coordinador aplican el tope oficial de 500 ms.
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`/paso responded ${res.status}`);
      }

      const data: unknown = await res.json();
      if (!data || typeof data !== "object" || !("siguienteNodo" in data) || typeof data.siguienteNodo !== "string") {
        throw new Error("Invalid /paso response: missing siguienteNodo");
      }
      return { siguienteNodo: data.siguienteNodo };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      this.latencias.push(performance.now() - inicio);
    }
  }

  /** Reinicia el registro de latencias (llamar entre rondas si se reutiliza la misma instancia). */
  resetLatencias(): void {
    this.latencias.length = 0;
  }
}
