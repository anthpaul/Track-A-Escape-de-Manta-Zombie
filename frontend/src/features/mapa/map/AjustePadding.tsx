"use client";

import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { paddingMapa } from "./padding";

// Keeps the map center in the free area when the panel opens or closes, or the screen rotates.
export default function AjustePadding({ panelAbierto }: { panelAbierto: boolean }) {
  const { current: mapa } = useMap();

  useEffect(() => {
    if (!mapa) return;
    const aplicar = () =>
      mapa.easeTo({ padding: paddingMapa({ ancho: window.innerWidth, alto: window.innerHeight, panelAbierto }), duration: 300 });
    aplicar();
    window.addEventListener("resize", aplicar);
    return () => window.removeEventListener("resize", aplicar);
  }, [mapa, panelAbierto]);

  return null;
}
