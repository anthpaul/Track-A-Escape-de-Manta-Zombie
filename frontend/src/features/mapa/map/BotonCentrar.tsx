"use client";

import { LocateFixed } from "lucide-react";
import { useMap } from "react-map-gl/maplibre";
import { INITIAL_ZOOM, MANTA_CENTER } from "@/features/mapa/map/config";

// Vuelve a la vista inicial de Manta: la salida rápida cuando el zoom o el arrastre te dejan perdido.
export default function BotonCentrar() {
  const { current: mapa } = useMap();
  return (
    <button
      type="button"
      onClick={() => mapa?.flyTo({ center: [MANTA_CENTER.longitude, MANTA_CENTER.latitude], zoom: INITIAL_ZOOM, duration: 800 })}
      aria-label="Ver toda Manta"
      title="Ver toda Manta"
      className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center border border-crimson-600 bg-crimson-100/95 text-calabaza-500 shadow-xl backdrop-blur hover:bg-crimson-200"
    >
      <LocateFixed className="size-5" />
    </button>
  );
}
