import { z } from "zod";

// Forma de GET /api/sobrevivientes/:id/ruta (AGENTS.md §5). Solo se dibuja la ruta; el resto se verifica
// para que una respuesta de otro sobreviviente o un body roto nunca llegue al mapa.
const RutaSchema = z.object({ sobrevivienteId: z.string(), ruta: z.array(z.string()) });

export function leerRuta(cuerpo: unknown, sobrevivienteId: string): string[] | null {
  const leida = RutaSchema.safeParse(cuerpo);
  if (!leida.success || leida.data.sobrevivienteId !== sobrevivienteId) return null;
  return leida.data.ruta;
}
