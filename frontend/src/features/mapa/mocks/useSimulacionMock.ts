"use client";

import { useEffect, useState } from "react";
import type { Grafo, Snapshot } from "../tipos";
import { avanzarTurno, crearSimulacion, type ConfigSimulacion } from "./simulacion";

const TURNO_MS = 2000;

// Emits a fake snapshot every 2 s, like polling GET /api/estado will (N4).
// When nobody is left on the road, it restarts with the next seed so the demo never freezes.
export function useSimulacionMock(grafo: Grafo, config: ConfigSimulacion): Snapshot {
  const [snapshot, setSnapshot] = useState(() => crearSimulacion(grafo, config, new Date().toISOString()));

  useEffect(() => {
    let semilla = config.semilla;
    const id = setInterval(() => {
      setSnapshot((actual) => {
        const ahora = new Date().toISOString();
        if (actual.metricas.vivos === 0) {
          semilla += 1;
          return crearSimulacion(grafo, { ...config, semilla }, ahora);
        }
        return avanzarTurno(grafo, actual, ahora);
      });
    }, TURNO_MS);
    return () => clearInterval(id);
  }, [grafo, config]);

  return snapshot;
}
