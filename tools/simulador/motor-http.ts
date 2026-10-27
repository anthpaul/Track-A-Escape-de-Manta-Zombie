/**
 * HTTP motor client — calls the real POST /api/paso on AWS.
 *
 * Drop-in replacement for motor-falso.ts once the backend is deployed.
 *
 * Configuration (via environment variables or constructor options):
 *   PASO_URL   — full URL, e.g. https://xxx.cloudfront.net/api/paso
 *   PASO_KEY   — value for the x-api-key header
 *
 * Latency recording:
 *   Every call appends its wall-clock duration (ms) to `latencias`.
 *   The round runner reads this array to compute p50/p95/p99.
 *   Includes response-body parsing and failures, with exactly one sample per call.
 */
import type { ClienteMotor, PedidoPaso, RespuestaPaso } from "./motor-falso";

export interface OpcionesMotorHttp {
  url?: string;
  apiKey?: string;
}

export class MotorHttp implements ClienteMotor {
  private readonly url: string;
  private readonly apiKey: string;
  /** Recorded response times in ms, one per /paso call. */
  readonly latencias: number[] = [];

  constructor(opts: OpcionesMotorHttp = {}) {
    this.url = opts.url ?? process.env.PASO_URL ?? "";
    this.apiKey = opts.apiKey ?? process.env.PASO_KEY ?? "";
    if (!this.url) throw new Error("PASO_URL is required (env var or constructor option)");
    if (!this.apiKey) throw new Error("PASO_KEY is required (env var or constructor option)");
  }

  async pedirPaso(pedido: PedidoPaso, signal?: AbortSignal): Promise<RespuestaPaso> {
    const inicio = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
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
        // Both standalone calls and the coordinator enforce the official 500 ms ceiling.
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

  /** Reset latency records (call between rounds if reusing the same instance). */
  resetLatencias(): void {
    this.latencias.length = 0;
  }
}
