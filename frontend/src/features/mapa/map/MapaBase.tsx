"use client";

import { useState } from "react";
import Map, { type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { Map as MapaMaplibre } from "maplibre-gl";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  INITIAL_ZOOM,
  MANTA_BOUNDS,
  MANTA_CENTER,
  MAP_STYLE_URL,
  MAX_ZOOM,
  MIN_ZOOM,
  VELOCIDAD_ZOOM_RUEDA,
  VELOCIDAD_ZOOM_TRACKPAD,
} from "@/features/mapa/map/config";
import { pinturaTematica } from "@/features/mapa/map/tema-mapa";

// scripts/copy-maplibre-worker.mjs copia el worker a public/; el parámetro de versión invalida las cachés viejas.
setWorkerUrl(`/maplibre-gl-worker.js?v=${getVersion()}`);

// Mapa base presentacional. Las capas en vivo (calles, zombies, sobrevivientes) se pasan como children.
type Props = {
  children?: React.ReactNode;
  // Capas cuyas features responden a clics (cursor de puntero al pasar por encima).
  capasInteractivas?: string[];
  // Recibe todas las features interactivas bajo el puntero (suelen superponerse en un mismo nodo).
  onClickEntidad?: (entidades: { capa: string; propiedades: Record<string, unknown> }[]) => void;
};

export default function MapaBase({ children, capasInteractivas, onClickEntidad }: Props) {
  const [falloEstilo, setFalloEstilo] = useState(false);
  const [sobreEntidad, setSobreEntidad] = useState(false);

  // Recolorea solo las capas base de CARTO con la paleta nocturna; nuestras capas GeoJSON conservan sus propios colores.
  // Se ejecuta en cada styledata (no solo en "load", que espera todos los tiles, muestra primero los colores
  // originales de CARTO y no ve las recargas de estilo posteriores). Solo define las propiedades que cambiaron, así que cuando
  // ya coinciden no cambia nada y no puede entrar en bucle.
  const recolorear = (mapa: MapaMaplibre) => {
    // Las capas del estilo existen apenas se parsea su JSON; isStyleLoaded() esperaría además todos los tiles.
    if (!mapa.getLayer("background")) return;
    for (const capa of mapa.getStyle().layers) {
      const fuente = "source" in capa && typeof capa.source === "string" ? mapa.getSource(capa.source) : undefined;
      if (fuente?.type === "geojson") continue;
      for (const [propiedad, valor] of pinturaTematica(capa)) {
        if (mapa.getPaintProperty(capa.id, propiedad) !== valor) mapa.setPaintProperty(capa.id, propiedad, valor);
      }
    }
  };

  const alHacerClick = (e: MapLayerMouseEvent) => {
    const entidades = (e.features ?? []).map((f) => ({ capa: f.layer.id, propiedades: f.properties ?? {} }));
    if (entidades.length > 0 && onClickEntidad) onClickEntidad(entidades);
  };

  return (
    <div className="relative h-full w-full">
      <Map
        initialViewState={{ ...MANTA_CENTER, zoom: INITIAL_ZOOM }}
        maxBounds={MANTA_BOUNDS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: false }}
        style={{ width: "100%", height: "100%" }}
        // Solo un error mientras el estilo mismo no está cargado significa que falta el mapa base
        // (p. ej., sin red). Los errores de tiles o glifos ocurren después de cargar el estilo y se ignoran.
        onError={(e) => {
          if (!e.target.isStyleLoaded()) setFalloEstilo(true);
        }}
        onStyleData={(e) => {
          setFalloEstilo(false);
          recolorear(e.target);
        }}
        onLoad={(e) => {
          recolorear(e.target);
          e.target.scrollZoom.setWheelZoomRate(VELOCIDAD_ZOOM_RUEDA);
          e.target.scrollZoom.setZoomRate(VELOCIDAD_ZOOM_TRACKPAD);
        }}
        interactiveLayerIds={capasInteractivas}
        onClick={alHacerClick}
        onMouseEnter={() => setSobreEntidad(true)}
        onMouseLeave={() => setSobreEntidad(false)}
        cursor={sobreEntidad ? "pointer" : undefined}
      >
        {children}
      </Map>
      {falloEstilo && (
        <div
          role="alert"
          className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-red-950/90 px-4 py-2 text-sm text-red-100 shadow"
        >
          No se pudo cargar el mapa base. Revisa la conexión a internet.
        </div>
      )}
    </div>
  );
}
