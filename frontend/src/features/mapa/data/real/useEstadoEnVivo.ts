"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import { leerEstado } from "@/features/mapa/data/real/estado-api";

const TURNO_MS = 2000;

// Build-time switches (AGENTS.md §8): the production build sets NEXT_PUBLIC_USE_MOCKS=false and
// NEXT_PUBLIC_API_URL=/api. Local dev without them keeps the in-browser simulation.
export const USAR_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type Conexion = "conectando" | "en_vivo" | "sin_partida" | "sin_conexion";

// Polls GET /api/estado once per turn. On a failed poll the last good snapshot is kept, so its
// age in the "EN VIVO" indicator shows the delay instead of the map silently freezing.
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

  return useMemo(() => {
    if (consulta.data === undefined) return { snapshot: null, conexion: consulta.isError ? "sin_conexion" : "conectando" };
    const resultado = leerEstado(consulta.data, grafo);
    if (resultado.tipo === "partida") return { snapshot: resultado.snapshot, conexion: consulta.isError ? "sin_conexion" : "en_vivo" };
    return { snapshot: null, conexion: resultado.tipo === "sinPartida" ? "sin_partida" : "sin_conexion" };
  }, [consulta.data, consulta.isError, grafo]);
}
