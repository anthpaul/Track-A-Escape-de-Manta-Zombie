"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { ICONOS_MAPA, LADO_ICONO, svgIconoMapa } from "@/features/mapa/simbologia/iconos";

// Renderiza los componentes de Lucide fuera de pantalla, serializa su SVG y registra cada uno como
// imagen de MapLibre. Usa solo la API pública de lucide-react, sin emojis ni archivos de imagen.
export default function RegistroIconos() {
  const { current: mapa } = useMap();
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapa || !contenedor.current) return;
    const nodos = contenedor.current;
    let cancelado = false;

    const registrar = async () => {
      for (const svg of Array.from(nodos.querySelectorAll<SVGElement>("svg[data-icono]"))) {
        // Todavía no hay estilo (o se eliminó el mapa): el listener de "load" de abajo vuelve a ejecutar esto.
        if (cancelado || !mapa.getMap().style) return;
        const nombre = svg.dataset.icono!;
        // hasImage lanza un error mientras el estilo no está listo (o después de eliminar el mapa). Está dentro
        // del try para que un fallo solo omita este ícono; styleimagemissing lo reintenta cuando una capa lo necesite.
        try {
          if (mapa.hasImage(nombre)) continue;
          const imagen = new Image(LADO_ICONO, LADO_ICONO);
          const { fondo, forma, borde } = ICONOS_MAPA[nombre];
          imagen.src = svgIconoMapa(svg.outerHTML, fondo, forma, borde);
          await imagen.decode();
          // Se vuelve a verificar después del await: una llamada en paralelo (styleimagemissing) puede haberlo agregado ya.
          if (!cancelado && !mapa.hasImage(nombre)) mapa.addImage(nombre, imagen, { pixelRatio: 2 });
        } catch (error) {
          // Un ícono roto no debe impedir que se registren los demás.
          console.error(`No se pudo registrar el ícono "${nombre}"`, error);
        }
      }
    };

    void registrar();
    // Una recarga del estilo descarta las imágenes propias; se registran de nuevo cuando MapLibre pide una, y una vez
    // que el mapa cargó, por si la primera pasada corrió antes de que el estilo estuviera listo.
    const alFaltar = () => void registrar();
    mapa.on("styleimagemissing", alFaltar);
    mapa.on("load", alFaltar);
    return () => {
      cancelado = true;
      mapa.off("styleimagemissing", alFaltar);
      mapa.off("load", alFaltar);
    };
  }, [mapa]);

  return (
    <div ref={contenedor} hidden aria-hidden>
      {Object.entries(ICONOS_MAPA).map(([nombre, { Icono, trazo, relleno, grosor }]) => (
        <Icono key={nombre} data-icono={nombre} size={32} color={trazo} fill={relleno ?? "none"} strokeWidth={grosor ?? 2.25} />
      ))}
    </div>
  );
}
