"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { ICONOS_MAPA, LADO_ICONO, svgIconoMapa } from "@/features/mapa/simbologia/iconos";

// Renders the Lucide components off-screen, serializes their SVG and registers each one as a
// MapLibre image. Uses only the public lucide-react API and no emoji or image files.
export default function RegistroIconos() {
  const { current: mapa } = useMap();
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapa || !contenedor.current) return;
    const nodos = contenedor.current;
    let cancelado = false;

    const registrar = async () => {
      for (const svg of Array.from(nodos.querySelectorAll<SVGElement>("svg[data-icono]"))) {
        const nombre = svg.dataset.icono!;
        if (mapa.hasImage(nombre)) continue;
        try {
          const imagen = new Image(LADO_ICONO, LADO_ICONO);
          imagen.src = svgIconoMapa(svg.outerHTML, ICONOS_MAPA[nombre].fondo);
          await imagen.decode();
          // Re-check after the await: a parallel call (styleimagemissing) may have added it already.
          if (!cancelado && !mapa.hasImage(nombre)) mapa.addImage(nombre, imagen, { pixelRatio: 2 });
        } catch (error) {
          // One broken icon must not stop the others from registering.
          console.error(`No se pudo registrar el ícono "${nombre}"`, error);
        }
      }
    };

    void registrar();
    // A style reload drops custom images; register them again when MapLibre asks for one.
    const alFaltar = () => void registrar();
    mapa.on("styleimagemissing", alFaltar);
    return () => {
      cancelado = true;
      mapa.off("styleimagemissing", alFaltar);
    };
  }, [mapa]);

  return (
    <div ref={contenedor} hidden aria-hidden>
      {Object.entries(ICONOS_MAPA).map(([nombre, { Icono, trazo, relleno }]) => (
        <Icono key={nombre} data-icono={nombre} size={32} color={trazo} fill={relleno ?? "none"} strokeWidth={2.25} />
      ))}
    </div>
  );
}
