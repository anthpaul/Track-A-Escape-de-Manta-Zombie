"use client";

import { useEffect, useRef, useState } from "react";
import type { Grafo, Snapshot } from "../tipos";
import { avanzarTurno, crearSimulacion, type ConfigSimulacion } from "./simulacion";

const TURNO_MS = 2000;

// Emits a fake snapshot every 2 s, like polling GET /api/estado will (N4).
// When nobody is left on the road, it restarts with the next seed so the demo never freezes.
export function useSimulacionMock(grafo: Grafo, config: ConfigSimulacion): Snapshot {
  const [snapshot, setSnapshot] = useState(() => crearSimulacion(grafo, config, new Date().toISOString()));
  // Kept outside the state updater: React may run updaters twice in dev (StrictMode),
  // so they must stay pure.
  const actualRef = useRef(snapshot);
  const semillaRef = useRef(config.semilla);

  useEffect(() => {
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
  }, [grafo, config]);

  return snapshot;
}
