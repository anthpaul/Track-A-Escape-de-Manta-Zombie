import { z } from "zod";

// Shape of GET /api/sobrevivientes/:id/ruta (AGENTS.md §5). Only the route is drawn; the rest is checked
// so an answer for another survivor or a broken body never reaches the map.
const RutaSchema = z.object({ sobrevivienteId: z.string(), ruta: z.array(z.string()) });

export function leerRuta(cuerpo: unknown, sobrevivienteId: string): string[] | null {
  const leida = RutaSchema.safeParse(cuerpo);
  if (!leida.success || leida.data.sobrevivienteId !== sobrevivienteId) return null;
  return leida.data.ruta;
}
