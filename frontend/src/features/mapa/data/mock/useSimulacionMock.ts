"use client";

import { useEffect, useRef, useState } from "react";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import { avanzarTurno, crearSimulacion, type ConfigSimulacion } from "@/features/mapa/data/mock/simulacion";

const TURNO_MS = 2000;

// Emite un snapshot falso cada 2 s, como lo hará el polling de GET /api/estado (N4).
// Cuando no queda nadie en camino, reinicia con la siguiente semilla para que la demo nunca se congele.
// Se pausa mientras llegan snapshots reales, para que el navegador no simule una ronda que nadie ve.
export function useSimulacionMock(grafo: Grafo, config: ConfigSimulacion, activo = true): Snapshot {
  const [snapshot, setSnapshot] = useState(() => crearSimulacion(grafo, config, new Date().toISOString()));
  // Se mantiene fuera del updater del estado: React puede ejecutar los updaters dos veces en dev (StrictMode),
  // así que deben ser puros.
  const actualRef = useRef(snapshot);
  const semillaRef = useRef(config.semilla);

  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => {
      const actual = actualRef.current;
      const ahora = new Date().toISOString();
      let siguiente: Snapshot;
      if (actual.metricas.vivos === 0) {
        semillaRef.current += 1;
        siguiente = crearSimulacion(grafo, { ...config, semilla: semillaRef.current }, ahora);
      } else {
        siguiente = avanzarTurno(grafo, actual, ahora, semillaRef.current);
      }
      actualRef.current = siguiente;
      setSnapshot(siguiente);
    }, TURNO_MS);
    return () => clearInterval(id);
  }, [grafo, config, activo]);

  return snapshot;
}
