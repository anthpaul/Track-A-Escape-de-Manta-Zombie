"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { callesAGeoJSON, refugiosAGeoJSON } from "../geojson";
import type { Grafo } from "../tipos";
import { capaCalles, capaRefugios, capaRefugiosEtiquetas } from "./estilos";

type Props = { grafo: Grafo; aristasBloqueadas?: ReadonlySet<string> };

// Static graph layers: streets (colored by type, red when blocked) and shelters.
export default function CapaGrafo({ grafo, aristasBloqueadas }: Props) {
  const calles = useMemo(() => callesAGeoJSON(grafo, aristasBloqueadas), [grafo, aristasBloqueadas]);
  const refugios = useMemo(() => refugiosAGeoJSON(grafo), [grafo]);

  return (
    <>
      <Source id="calles" type="geojson" data={calles}>
        <Layer {...capaCalles} />
      </Source>
      <Source id="refugios" type="geojson" data={refugios}>
        <Layer {...capaRefugios} />
        <Layer {...capaRefugiosEtiquetas} />
      </Source>
    </>
  );
}
