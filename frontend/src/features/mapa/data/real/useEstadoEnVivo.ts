"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conexion, Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import { leerEstado } from "@/features/mapa/data/real/estado-api";
import { resolverConexion, type UltimoReal } from "@/features/mapa/data/real/conexion";

const TURNO_MS = 2000;

// Interruptores de build (AGENTS.md §8): el build de producción define NEXT_PUBLIC_USE_MOCKS=false y
// NEXT_PUBLIC_API_URL=/api. El desarrollo local sin ellos mantiene la simulación en el navegador.
export const USAR_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Hace polling de GET /api/estado una vez por turno. La decisión de qué mostrar vive en resolverConexion (pura,
// con tests); este hook solo le pasa el último poll y recuerda el último mundo real.
export function useEstadoEnVivo(grafo: Grafo, activo: boolean): { snapshot: Snapshot | null; conexion: Conexion } {
  const consulta = useQuery({
    queryKey: ["estado", API_URL],
    queryFn: async ({ signal }): Promise<unknown> => {
      const respuesta = await fetch(`${API_URL}/estado`, { signal, cache: "no-store" });
      if (!respuesta.ok) throw new Error(`GET /estado ${respuesta.status}`);
      return respuesta.json();
    },
    enabled: activo,
    refetchInterval: TURNO_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });

  // Memoizado sobre la respuesta, para que la misma respuesta conserve el mismo objeto snapshot.
  const leido = useMemo(() => (consulta.data === undefined ? null : leerEstado(consulta.data, grafo)), [consulta.data, grafo]);
  const ultimoFallo = consulta.errorUpdatedAt > consulta.dataUpdatedAt;
  const resultado = ultimoFallo ? "error" : (leido ?? "pendiente");
  const ahora = Math.max(consulta.dataUpdatedAt, consulta.errorUpdatedAt);

  // Actualizar el estado durante el render (con guarda) es el patrón de React para valores derivados de un render anterior.
  const [ultimoReal, setUltimoReal] = useState<UltimoReal | null>(null);
  const salida = resolverConexion({ resultado, ultimoReal, ahora });
  if (salida.ultimoReal !== ultimoReal) setUltimoReal(salida.ultimoReal);

  if (!activo) return { snapshot: null, conexion: "simulado" };
  return { snapshot: salida.snapshot, conexion: salida.conexion };
}
