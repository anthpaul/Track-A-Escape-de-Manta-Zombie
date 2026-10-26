"use client";

import dynamic from "next/dynamic";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaBase = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
      Cargando mapa de Manta…
    </div>
  ),
});

export default function MapaCliente() {
  return <MapaBase />;
}
