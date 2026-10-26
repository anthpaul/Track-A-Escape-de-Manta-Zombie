"use client";

import dynamic from "next/dynamic";
import { grafoMini } from "./mocks/grafo-mini";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaBase = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
      Cargando mapa de Manta…
    </div>
  ),
});
const CapaGrafo = dynamic(() => import("./capas/CapaGrafo"), { ssr: false });

// Container: picks the data source. Uses the mock graph until shared/data/manta.json exists (T0.3).
export default function MapaCliente() {
  const grafo = grafoMini;
  const esPrueba = grafo.version.startsWith("mock");

  return (
    <div className="relative h-full w-full">
      <MapaBase>
        <CapaGrafo grafo={grafo} />
      </MapaBase>
      {esPrueba && (
        <span className="absolute left-3 top-3 rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black">
          Datos de prueba
        </span>
      )}
    </div>
  );
}
