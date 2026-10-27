"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/features/mapa/data/real/useEstadoEnVivo";
import { leerRuta } from "@/features/mapa/data/real/ruta-api";

// Planned route of the followed survivor from GET /api/sobrevivientes/:id/ruta (K6), asked once per turn.
// While the next turn loads, the previous route of the same survivor stays, so the line never blinks.
// Null when there is nothing real to draw yet: the caller decides the fallback.
export function useRutaEnVivo(sobrevivienteId: string | null, turno: number): string[] | null {
  const consulta = useQuery({
    queryKey: ["ruta", sobrevivienteId, turno],
    queryFn: async ({ signal }): Promise<string[] | null> => {
      const respuesta = await fetch(`${API_URL}/sobrevivientes/${encodeURIComponent(sobrevivienteId!)}/ruta`, { signal, cache: "no-store" });
      if (!respuesta.ok) return null;
      return leerRuta(await respuesta.json(), sobrevivienteId!);
    },
    enabled: sobrevivienteId !== null,
    staleTime: Infinity, // a turn's route never changes
    retry: false,
    placeholderData: (previa, consultaPrevia) => (consultaPrevia?.queryKey[1] === sobrevivienteId ? previa : undefined),
  });
  return sobrevivienteId === null ? null : (consulta.data ?? null);
}
