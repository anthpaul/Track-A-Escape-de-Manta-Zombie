/**
 * GET /api/sobrevivientes/:id/ruta: K6 (AGENTS.md §5).
 *
 * Público y de solo lectura. Usa el último turno completo (el mismo que muestra /estado)
 * para que la ruta dibujada siempre coincida con el mapa. Solo se pide cuando el mapa
 * selecciona un sobreviviente.
 *
 *   200 en_ruta                { sobrevivienteId, turno, refugio, ruta }
 *   200 a_salvo | mordido      { sobrevivienteId, turno, refugio, ruta: [], estado }
 *   200 sin refugio alcanzable { sobrevivienteId, turno, refugio: null, ruta: [nodo], motivo: "sin_ruta" }
 *   400 id fuera del formato S-0000
 *   404 el sobreviviente no está en la partida activa, o no hay partida en curso
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
      // No hay partida en curso: el sobreviviente no puede existir en ella.
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
    // El mismo reparto de refugios que /paso (capacidad Pro), así la ruta dibujada coincide con los pasos que se dan.
    const cupos = asignarCupos(contexto, estado);
    let rutaCompleta = calcularRutaCompleta(sobreviviente.nodo, contexto, estado, cupos?.refugiosPara(sobrevivienteId));
    if (rutaCompleta.refugio === null && cupos && cupos.conLugar.size > 0) {
      rutaCompleta = calcularRutaCompleta(sobreviviente.nodo, contexto, estado, cupos.conLugar);
    }
    return c.json({ ...base, ...rutaCompleta });
  });

  return ruta;
}
