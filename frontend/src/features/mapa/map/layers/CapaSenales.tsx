"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { senalesAGeoJSON } from "@/features/mapa/map/geojson/grafo";
import type { Grafo } from "@/features/mapa/domain/tipos";
import { capaSenales } from "@/features/mapa/map/layers/estilos";

type Props = { grafo: Grafo; aristasBloqueadas: ReadonlySet<string> };

// Señales de tránsito en calles bloqueadas (S1). Se montan después de las capas en vivo para que ningún zombie ni sobreviviente
// parado junto a una calle cerrada tape su señal.
export default function CapaSenales({ grafo, aristasBloqueadas }: Props) {
  const senales = useMemo(() => senalesAGeoJSON(grafo, aristasBloqueadas), [grafo, aristasBloqueadas]);
  return (
    <Source id="senales" type="geojson" data={senales}>
      <Layer {...capaSenales} />
    </Source>
  );
}
