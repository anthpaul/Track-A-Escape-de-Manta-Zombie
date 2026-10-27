"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conexion, Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import { leerEstado } from "@/features/mapa/data/real/estado-api";
import { resolverConexion, type UltimoReal } from "@/features/mapa/data/real/conexion";

const TURNO_MS = 2000;

// Build-time switches (AGENTS.md §8): the production build sets NEXT_PUBLIC_USE_MOCKS=false and
// NEXT_PUBLIC_API_URL=/api. Local dev without them keeps the in-browser simulation.
export const USAR_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Polls GET /api/estado once per turn. The decision of what to show lives in resolverConexion (pure,
// tested); this hook only feeds it the latest poll and remembers the last real world.
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

  // Memoized on the response so the same answer keeps the same snapshot object.
  const leido = useMemo(() => (consulta.data === undefined ? null : leerEstado(consulta.data, grafo)), [consulta.data, grafo]);
  const ultimoFallo = consulta.errorUpdatedAt > consulta.dataUpdatedAt;
  const resultado = ultimoFallo ? "error" : (leido ?? "pendiente");
  const ahora = Math.max(consulta.dataUpdatedAt, consulta.errorUpdatedAt);

  // Updating state during render (guarded) is React's pattern for values derived from a previous render.
  const [ultimoReal, setUltimoReal] = useState<UltimoReal | null>(null);
  const salida = resolverConexion({ resultado, ultimoReal, ahora });
  if (salida.ultimoReal !== ultimoReal) setUltimoReal(salida.ultimoReal);

  if (!activo) return { snapshot: null, conexion: "simulado" };
  return { snapshot: salida.snapshot, conexion: salida.conexion };
}
