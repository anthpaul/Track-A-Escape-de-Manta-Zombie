/**
 * GET /api/estado: snapshot del mundo en vivo para el mapa del frontend.
 *
 * Devuelve el último turno completo de la partida activa.
 * Endpoint público: no requiere API key (AGENTS.md §5).
 * Cache-Control: no-store (cambia cada 2 s).
 *
 * Respuesta exitosa (200):
 *   { turno, ronda, zombies, aristasBloqueadas, sobrevivientes, metricas, generadoEn }
 *
 * Respuesta cuando no hay partida en curso (200, no 404: el mapa siempre debe renderizarse):
 *   { ok: false, error: { code, message } }
 */
import type { Context } from "hono";
import { EstadoRepo, ErrorEstado } from "../db/estado-repo";

// ---------------------------------------------------------------------------
// Fábrica: inyecta el repositorio para que los tests puedan reemplazarlo
// ---------------------------------------------------------------------------

export function crearRutaEstado(repo: EstadoRepo) {
  return async (c: Context) => {
    c.header("Cache-Control", "no-store");

    try {
      const estado = await repo.obtenerEstado();
      return c.json(estado);
    } catch (error) {
      if (error instanceof ErrorEstado) {
        // Fallas conocidas: se responde un 200 limpio para que el frontend muestre
        // el estado "no hay partida en curso" en lugar de una pantalla de error.
        return c.json(
          { ok: false, error: { code: error.code, message: error.message } },
          200,
        );
      }
      // Error inesperado: lo maneja el manejador de errores de Hono (responde 500).
      throw error;
    }
  };
}
