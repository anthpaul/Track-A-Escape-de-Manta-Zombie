/**
 * Testable factory for the /paso route.
 *
 * The production route (rutaPaso) creates real AWS clients at module load time.
 * This factory accepts injectable dependencies so tests can run without AWS.
 *
 * ONLY imported by test files — never by production code.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { PasoInputSchema, PasoOutputSchema } from "@abcstack/shared";
import type { FuenteMundo } from "../motor/fuente-mundo";
import { ErrorFuenteMundo } from "../motor/fuente-mundo";
import { ErrorPartidaActiva } from "../db/partida-activa";
import { calcularSiguienteNodo, calcularPeligrosDelTurno, contextoGrafo } from "../motor/motor";

interface OpcionesRutaPaso {
  fuente: FuenteMundo;
  apiKey: string;
  budgetMs: number;
  /** Pass null to simulate NO_ACTIVE_PARTITION. */
  partidaId: string | null;
}

// ---------------------------------------------------------------------------
// Constant-time comparison (duplicated from paso.ts — avoids coupling)
// ---------------------------------------------------------------------------

function comparacionTiempoConstante(a: string, b: string): boolean {
  const MAX = 256;
  let diff = 0;
  for (let i = 0; i < MAX; i++) {
    diff |= a.charCodeAt(i % Math.max(a.length, 1)) ^ b.charCodeAt(i % Math.max(b.length, 1));
  }
  diff |= a.length ^ b.length;
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Budget helper (duplicated from paso.ts — avoids coupling)
// ---------------------------------------------------------------------------

async function conPresupuesto<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<{ value: T; timedOut: false } | { value: undefined; timedOut: true }> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<{ value: undefined; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ value: undefined, timedOut: true }), budgetMs);
  });
  try {
    return await Promise.race([
      promise.then((value): { value: T; timedOut: false } => ({ value, timedOut: false })),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRutaPasoParaTests(opts: OpcionesRutaPaso): Hono {
  const ruta = new Hono();

  ruta.post("/", async (c: Context) => {
    // 1. Auth
    const providedKey = c.req.header("x-api-key") ?? "";
    if (!opts.apiKey || !comparacionTiempoConstante(providedKey, opts.apiKey)) {
      return c.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing x-api-key" } },
        401,
      );
    }

    // 2. Body validation
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Request body must be valid JSON" } },
        400,
      );
    }

    const parsed = PasoInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Invalid body", details: parsed.error.flatten() } },
        400,
      );
    }

    const { sobrevivienteId, nodoActual, turno } = parsed.data;

    // 3. Core work
    const work = async (): Promise<string> => {
      if (opts.partidaId === null) {
        throw new ErrorPartidaActiva("NO_ACTIVE_PARTITION", "No active partition (test)");
      }

      const mundo = await opts.fuente.obtenerTurno(opts.partidaId, turno);
      const peligros = calcularPeligrosDelTurno(mundo, contextoGrafo.indexado);
      const { siguienteNodo } = calcularSiguienteNodo(
        { sobrevivienteId, nodoActual, mundo },
        peligros,
      );
      return siguienteNodo;
    };

    const { value: siguienteNodo, timedOut } = await conPresupuesto(work(), opts.budgetMs);
    const nodoFinal = timedOut ? nodoActual : siguienteNodo;

    // 4. Output validation
    const output = PasoOutputSchema.safeParse({ siguienteNodo: nodoFinal });
    if (!output.success) {
      return c.json(PasoOutputSchema.parse({ siguienteNodo: nodoActual }));
    }

    return c.json(output.data);
  });

  return ruta;
}
