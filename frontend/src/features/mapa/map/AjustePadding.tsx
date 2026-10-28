"use client";

import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { paddingMapa } from "./padding";

// Mantiene el centro del mapa en el área libre cuando el panel se abre o se cierra, o cuando la pantalla rota.
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
