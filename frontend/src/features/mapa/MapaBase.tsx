"use client";

import Map from "react-map-gl/maplibre";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INITIAL_ZOOM, MANTA_BOUNDS, MANTA_CENTER, MAP_STYLE_URL, MIN_ZOOM } from "./config";

// The worker is copied to public/ by scripts/copy-maplibre-worker.mjs; the version query busts stale caches.
setWorkerUrl(`/maplibre-gl-worker.js?v=${getVersion()}`);

// Presentational base map. Live layers (streets, zombies, survivors) are added as children in N1/N2.
export default function MapaBase({ children }: { children?: React.ReactNode }) {
  return (
    <Map
      initialViewState={{ ...MANTA_CENTER, zoom: INITIAL_ZOOM }}
      maxBounds={MANTA_BOUNDS}
      minZoom={MIN_ZOOM}
      mapStyle={MAP_STYLE_URL}
      attributionControl={{ compact: false }}
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </Map>
  );
}
