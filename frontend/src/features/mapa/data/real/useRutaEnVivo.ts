"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/features/mapa/data/real/useEstadoEnVivo";
import { leerRuta } from "@/features/mapa/data/real/ruta-api";

// Ruta planificada del sobreviviente seguido, desde GET /api/sobrevivientes/:id/ruta (K6), pedida una vez por turno.
// Mientras carga el siguiente turno se mantiene la ruta anterior del mismo sobreviviente, así la línea nunca parpadea.
// Null cuando todavía no hay nada real que dibujar: quien llama decide el respaldo.
export function useRutaEnVivo(sobrevivienteId: string | null, turno: number): string[] | null {
  const consulta = useQuery({
    queryKey: ["ruta", sobrevivienteId, turno],
    queryFn: async ({ signal }): Promise<string[] | null> => {
      const respuesta = await fetch(`${API_URL}/sobrevivientes/${encodeURIComponent(sobrevivienteId!)}/ruta`, { signal, cache: "no-store" });
      if (!respuesta.ok) return null;
      return leerRuta(await respuesta.json(), sobrevivienteId!);
    },
    enabled: sobrevivienteId !== null,
    staleTime: Infinity, // la ruta de un turno nunca cambia
    retry: false,
    placeholderData: (previa, consultaPrevia) => (consultaPrevia?.queryKey[1] === sobrevivienteId ? previa : undefined),
  });
  return sobrevivienteId === null ? null : (consulta.data ?? null);
}
