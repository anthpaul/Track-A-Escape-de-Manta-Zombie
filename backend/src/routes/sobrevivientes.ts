/**
 * GET /api/sobrevivientes/:id/ruta — K6 (AGENTS.md §5).
 *
 * Public, read-only. Uses the last complete turn (the same one /estado shows) so
 * the drawn route always matches the map. Asked only when the map selects a survivor.
 *
 *   200 en_ruta             { sobrevivienteId, turno, refugio, ruta }
 *   200 a_salvo | mordido   { sobrevivienteId, turno, refugio, ruta: [], estado }
 *   200 no shelter reachable { sobrevivienteId, turno, refugio: null, ruta: [nodo], motivo: "sin_ruta" }
 *   400 id outside the S-0000 format
 *   404 survivor not in the active game, or no game running
 */
import { Hono } from "hono";
import { SobrevivienteIdSchema } from "@abcstack/shared";
import { ErrorEstado, type EstadoRepo } from "../db/estado-repo";
import type { ContextoGrafo } from "../motor/astar";
import { calcularRutaCompleta } from "../motor/ruta";
import { asignarCupos } from "../motor/cupos";

export function crearRutaSobrevivientes(repo: Pick<EstadoRepo, "obtenerEstado">, contexto: ContextoGrafo): Hono {
  const ruta = new Hono();

  ruta.get("/:id/ruta", async (c) => {
    c.header("Cache-Control", "no-store");

    const id = SobrevivienteIdSchema.safeParse(c.req.param("id"));
    if (!id.success) {
      return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Survivor id must look like S-0000" } }, 400);
    }
    const sobrevivienteId = id.data;

    let estado;
    try {
      estado = await repo.obtenerEstado();
    } catch (error) {
      // No game running: the survivor cannot exist in it.
      if (error instanceof ErrorEstado) return c.json({ ok: false, error: { code: error.code, message: error.message } }, 404);
      throw error;
    }

    const sobreviviente = estado.sobrevivientes.find((s) => s.id === sobrevivienteId);
    if (!sobreviviente) {
      return c.json(
        { ok: false, error: { code: "SOBREVIVIENTE_NO_ENCONTRADO", message: `${sobrevivienteId} is not in the active game` } },
        404,
      );
    }

    const base = { sobrevivienteId, turno: estado.turno };
    if (sobreviviente.estado !== "en_ruta") {
      return c.json({ ...base, refugio: sobreviviente.refugio ?? null, ruta: [], estado: sobreviviente.estado });
    }
    // Same shelter allocation as /paso (Pro capacity), so the drawn route matches the steps taken.
    const cupos = asignarCupos(contexto, estado);
    let rutaCompleta = calcularRutaCompleta(sobreviviente.nodo, contexto, estado, cupos?.refugiosPara(sobrevivienteId));
    if (rutaCompleta.refugio === null && cupos && cupos.conLugar.size > 0) {
      rutaCompleta = calcularRutaCompleta(sobreviviente.nodo, contexto, estado, cupos.conLugar);
    }
    return c.json({ ...base, ...rutaCompleta });
  });

  return ruta;
}
