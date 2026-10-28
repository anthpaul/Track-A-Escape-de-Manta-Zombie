"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { senalesAGeoJSON } from "@/features/mapa/map/geojson/grafo";
import type { Grafo } from "@/features/mapa/domain/tipos";
import { capaSenales } from "@/features/mapa/map/layers/estilos";

type Props = { grafo: Grafo; aristasBloqueadas: ReadonlySet<string> };

// Traffic signs on blocked streets (S1). Mounted after the live layers so no zombie or survivor
// standing next to a closed street ever hides its sign.
export default function CapaSenales({ grafo, aristasBloqueadas }: Props) {
  const senales = useMemo(() => senalesAGeoJSON(grafo, aristasBloqueadas), [grafo, aristasBloqueadas]);
  return (
    <Source id="senales" type="geojson" data={senales}>
      <Layer {...capaSenales} />
    </Source>
  );
}
