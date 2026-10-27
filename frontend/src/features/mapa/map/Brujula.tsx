"use client";

import { useMap } from "react-map-gl/maplibre";

// Compass: shows north and puts the map back facing north after a rotation.
export default function Brujula() {
  const { current: mapa } = useMap();
  return (
    <button
      type="button"
      onClick={() => mapa?.resetNorthPitch()}
      aria-label="Orientar el mapa al norte"
      className="absolute bottom-20 right-4 z-10 flex size-11 items-center justify-center rounded-full border border-crimson-300 bg-crimson-100 font-pixel text-sm text-calabaza-900 shadow-lg hover:bg-crimson-300 md:bottom-5 md:right-5"
    >
      N
    </button>
  );
}
