"use client";

import { useState } from "react";
import Map from "react-map-gl/maplibre";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INITIAL_ZOOM, MANTA_BOUNDS, MANTA_CENTER, MAP_STYLE_URL, MIN_ZOOM } from "./config";

// The worker is copied to public/ by scripts/copy-maplibre-worker.mjs; the version query busts stale caches.
setWorkerUrl(`/maplibre-gl-worker.js?v=${getVersion()}`);

// Presentational base map. Live layers (streets, zombies, survivors) are passed as children.
export default function MapaBase({ children }: { children?: React.ReactNode }) {
  const [cargado, setCargado] = useState(false);
  const [falloEstilo, setFalloEstilo] = useState(false);

  return (
    <div className="relative h-full w-full">
      <Map
        initialViewState={{ ...MANTA_CENTER, zoom: INITIAL_ZOOM }}
        maxBounds={MANTA_BOUNDS}
        minZoom={MIN_ZOOM}
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: false }}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => setCargado(true)}
        // Errors before the first load mean the base style never arrived (e.g. no network).
        // Later errors are usually a single tile and are ignored.
        onError={() => {
          if (!cargado) setFalloEstilo(true);
        }}
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
