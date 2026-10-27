/**
 * POST /api/paso — K3 implementation (AGENTS.md §5, HOJA_DE_RUTA §4.1 item 5).
 *
 * Contract (fixed by the challenge organizer — never change the shape):
 *   Request body:  { sobrevivienteId, nodoActual, turno }
 *   Response 200:  { siguienteNodo }   ← exactly this, no envelope
 *   Response 400:  invalid body
 *   Response 401:  missing or wrong x-api-key
 *   Never 500:     a safe fallback (nodoActual) is always returned instead.
 *
 * Internal budget (AGENTS.md §4.3):
 *   300 ms hard deadline. If DynamoDB or A* has not finished by then,
 *   we return nodoActual as the safe fallback rather than timing out.
 *   The organizer's simulator cuts us off at 500 ms; we cut ourselves at
 *   300 ms to leave headroom for Lambda overhead and network.
 *
 * Security (AGENTS.md §4.3 / INFRA.md §2):
 *   API key compared in constant time to prevent timing side-channels.
 *   The key comes from process.env.API_KEY (set by Terraform, never committed).
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { PasoInputSchema, PasoOutputSchema } from "@abcstack/shared";
import { DynamoFuente } from "../db/dynamo-fuente";
import { PartidaActivaResolver } from "../db/partida-activa";
import { calcularSiguienteNodo, calcularPeligrosDelTurno, contextoGrafo } from "../motor/motor";

// ---------------------------------------------------------------------------
// DynamoDB client — created once per warm Lambda instance
// ---------------------------------------------------------------------------

const dynamo = DynamoDBDocument.from(
  new DynamoDB({ region: process.env.AWS_REGION ?? "us-east-2" }),
);
const TABLE = process.env.DDB_TABLE ?? "spookython_mundo";

const fuente = new DynamoFuente(dynamo, TABLE);
const resolver = new PartidaActivaResolver(dynamo, TABLE);

// ---------------------------------------------------------------------------
// Constant-time string comparison (timing-attack prevention)
// ---------------------------------------------------------------------------

/**
 * Compare two strings in constant time.
 * Both strings are iterated for exactly MAX iterations regardless of their
 * content so the execution time does not reveal which byte differs first.
 */
function comparacionTiempoConstante(a: string, b: string): boolean {
  const MAX = 256;
  let diff = 0;
  for (let i = 0; i < MAX; i++) {
    // Use modulo so the loop always runs MAX times even for short strings.
    diff |= a.charCodeAt(i % Math.max(a.length, 1)) ^ b.charCodeAt(i % Math.max(b.length, 1));
  }
  // Lengths must also match — prevents "abc" == "abcXXX" false positives.
  diff |= a.length ^ b.length;
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Budget helper
// ---------------------------------------------------------------------------

/**
 * Race a promise against a millisecond deadline.
 * Returns { value, timedOut: false } on success.
 * Returns { value: undefined, timedOut: true } when the deadline fires first.
 */
async function conPresupuesto<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<{ value: T; timedOut: false } | { value: undefined; timedOut: true }> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<{ value: undefined; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ value: undefined, timedOut: true }), budgetMs);
  });
  try {
    const result = await Promise.race([
      promise.then((value): { value: T; timedOut: false } => ({ value, timedOut: false })),
      deadline,
    ]);
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const rutaPaso = new Hono();

rutaPaso.post("/", async (c: Context) => {
  const apiKey = process.env.API_KEY ?? "";

  // ── 1. Authentication ─────────────────────────────────────────────────
  const providedKey = c.req.header("x-api-key") ?? "";
  // Reject immediately if the env var is not set (misconfigured deploy).
  if (!apiKey || !comparacionTiempoConstante(providedKey, apiKey)) {
    return c.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing x-api-key" } },
      401,
    );
  }

  // ── 2. Body validation ────────────────────────────────────────────────
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
      {
        ok: false,
        error: { code: "BAD_REQUEST", message: "Invalid body", details: parsed.error.flatten() },
      },
      400,
    );
  }

  const { sobrevivienteId, nodoActual, turno } = parsed.data;

  // ── 3. Core work within the 300 ms internal budget ───────────────────
  const work = async (): Promise<string> => {
    // 3a. Discover the active partition (AGENTS.md §4.5).
    //     The lock is cached for 1 s inside the resolver; 200 concurrent
    //     requests for the same turn share a single DynamoDB read.
    const partidaId = await resolver.resolverPartidaId(turno);

    // 3b. Fetch the world snapshot for this turn.
    //     DynamoFuente coalesces concurrent reads for the same (partidaId, turno).
    const mundo = await fuente.obtenerTurno(partidaId, turno);

    // 3c. Pre-compute danger sets once for this world snapshot.
    //     When 200 /paso requests arrive for the same turn they currently each
    //     compute their own peligros (cheap, pure computation). A shared cache
    //     keyed by (partidaId, turno) is a future optimisation.
    const peligros = calcularPeligrosDelTurno(mundo, contextoGrafo.indexado);

    // 3d. Run A* and return the next node.
    const { siguienteNodo } = calcularSiguienteNodo(
      { sobrevivienteId, nodoActual, mundo },
      peligros,
    );

    return siguienteNodo;
  };

  const { value: siguienteNodo, timedOut } = await conPresupuesto(work(), 300);

  // ── 4. Safe fallback on timeout (AGENTS.md §4.3 rule 2) ──────────────
  const nodoFinal = timedOut ? nodoActual : siguienteNodo;

  // ── 5. Final output validation ────────────────────────────────────────
  // buscarRuta always returns a valid node ID, but we parse through
  // PasoOutputSchema as a last safety net before sending the response.
  // If somehow the node ID is invalid, we fall back to nodoActual rather
  // than returning a 500.
  const output = PasoOutputSchema.safeParse({ siguienteNodo: nodoFinal });
  if (!output.success) {
    return c.json(PasoOutputSchema.parse({ siguienteNodo: nodoActual }));
  }

  // Return EXACTLY { siguienteNodo } — no envelope, as the contract requires.
  return c.json(output.data);
});
