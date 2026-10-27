/**
 * GET /api/estado — live world snapshot for the frontend map.
 *
 * Returns the last complete turn of the active game.
 * Public endpoint — no API key required (AGENTS.md §5).
 * Cache-Control: no-store (changes every 2 s).
 *
 * Response on success (200):
 *   { turno, ronda, zombies, aristasBloqueadas, sobrevivientes, metricas, generadoEn }
 *
 * Response when no game is running (200 — not a 404, the map must always render):
 *   { ok: false, error: { code, message } }
 */
import type { Context } from "hono";
import { EstadoRepo, ErrorEstado } from "../db/estado-repo";

// ---------------------------------------------------------------------------
// Factory — injects the repo so tests can swap it out
// ---------------------------------------------------------------------------

export function crearRutaEstado(repo: EstadoRepo) {
  return async (c: Context) => {
    c.header("Cache-Control", "no-store");

    try {
      const estado = await repo.obtenerEstado();
      return c.json(estado);
    } catch (error) {
      if (error instanceof ErrorEstado) {
        // Known failure modes — return a clean 200 so the frontend can display
        // a "no game running" state rather than an error screen.
        return c.json(
          { ok: false, error: { code: error.code, message: error.message } },
          200,
        );
      }
      // Unexpected error — let Hono's error handler deal with it (returns 500).
      throw error;
    }
  };
}
