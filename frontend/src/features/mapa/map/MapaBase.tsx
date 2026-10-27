"use client";

import { useState } from "react";
import Map, { type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { Map as MapaMaplibre } from "maplibre-gl";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INITIAL_ZOOM, MANTA_BOUNDS, MANTA_CENTER, MAP_STYLE_URL, MIN_ZOOM } from "@/features/mapa/map/config";
import { pinturaTematica } from "@/features/mapa/map/tema-mapa";

// The worker is copied to public/ by scripts/copy-maplibre-worker.mjs; the version query busts stale caches.
setWorkerUrl(`/maplibre-gl-worker.js?v=${getVersion()}`);

// Presentational base map. Live layers (streets, zombies, survivors) are passed as children.
type Props = {
  children?: React.ReactNode;
  // Layers whose features react to clicks (pointer cursor on hover).
  capasInteractivas?: string[];
  // Receives every interactive feature under the pointer (they often overlap on one node).
  onClickEntidad?: (entidades: { capa: string; propiedades: Record<string, unknown> }[]) => void;
};

export default function MapaBase({ children, capasInteractivas, onClickEntidad }: Props) {
  const [falloEstilo, setFalloEstilo] = useState(false);
  const [sobreEntidad, setSobreEntidad] = useState(false);

  // Recolor only the CARTO base layers with the night palette; our GeoJSON layers keep their own colors.
  // Runs on every styledata (not only on "load", which waits for every tile and shows the original CARTO
  // colors first, and misses later style reloads). It only sets properties that drifted, so once they
  // match it changes nothing and cannot loop.
  const recolorear = (mapa: MapaMaplibre) => {
    // The style's layers exist once its JSON is parsed; isStyleLoaded() would wait for every tile too.
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
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: false }}
        style={{ width: "100%", height: "100%" }}
        // Only an error while the style itself is not loaded means the base map is missing
        // (e.g. no network). Tile or glyph errors happen after the style loads and are ignored.
        onError={(e) => {
          if (!e.target.isStyleLoaded()) setFalloEstilo(true);
        }}
        onStyleData={(e) => {
          setFalloEstilo(false);
          recolorear(e.target);
        }}
        onLoad={(e) => recolorear(e.target)}
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
