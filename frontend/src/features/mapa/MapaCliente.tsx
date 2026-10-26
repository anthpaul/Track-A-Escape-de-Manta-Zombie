"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { grafoMini } from "./mocks/grafo-mini";
import { useSimulacionMock } from "./mocks/useSimulacionMock";
import type { ConfigSimulacion } from "./mocks/simulacion";
import MedidorFps from "./MedidorFps";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaVivo = dynamic(() => import("./MapaVivo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
      Cargando mapa de Manta…
    </div>
  ),
});

// R3-sized mock round (200 survivors) to check the map stays smooth at the real load.
const CONFIG_MOCK: ConfigSimulacion = { sobrevivientes: 200, caminantes: 4, corredores: 2, hordas: 1, semilla: 7 };

// Container: picks the data sources. Mock graph and mock snapshots until manta.json (T0.3)
// and GET /api/estado (S5) exist; N4 swaps the hook for real polling.
export default function MapaCliente() {
  const grafo = grafoMini;
  const snapshot = useSimulacionMock(grafo, CONFIG_MOCK);
  const esPrueba = grafo.version.startsWith("mock");

  // Same Set instance while the blocked list is unchanged, so street GeoJSON is not rebuilt every turn.
  const clave = snapshot.aristasBloqueadas.join(",");
  const aristasBloqueadas = useMemo(() => new Set(clave ? clave.split(",") : []), [clave]);

  return (
    <div className="relative h-full w-full">
      <MapaVivo grafo={grafo} snapshot={snapshot} aristasBloqueadas={aristasBloqueadas} />
      {esPrueba && (
        <span className="absolute left-3 top-3 rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black">
          Datos de prueba · turno {snapshot.turno}
        </span>
      )}
      <MedidorFps />
    </div>
  );
}
