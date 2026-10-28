"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { callesAGeoJSON, refugiosAGeoJSON } from "@/features/mapa/map/geojson/grafo";
import type { Grafo } from "@/features/mapa/domain/tipos";
import {
  capaCalles,
  capaPuentesDanados,
  capaRefugios,
  capaRefugiosBase,
  capaRefugiosEtiquetas,
} from "@/features/mapa/map/layers/estilos";
import { conVisibilidad } from "./visibilidad";

type Props = { grafo: Grafo; aristasBloqueadas?: ReadonlySet<string>; refugiosVisibles?: boolean };

// Static graph layers: the walkable network (colored by type, red when blocked, damaged bridges
// dashed) and shelters. The traffic signs live in CapaSenales, drawn on top of everything.
// Streets cannot be switched off: blocked streets are a requirement of the live map.
export default function CapaGrafo({ grafo, aristasBloqueadas, refugiosVisibles = true }: Props) {
  const calles = useMemo(() => callesAGeoJSON(grafo, aristasBloqueadas), [grafo, aristasBloqueadas]);
  const refugios = useMemo(() => refugiosAGeoJSON(grafo), [grafo]);
  const v = refugiosVisibles;

  return (
    <>
      <Source id="calles" type="geojson" data={calles}>
        <Layer {...capaCalles} />
        <Layer {...capaPuentesDanados} />
      </Source>
      <Source id="refugios" type="geojson" data={refugios}>
        <Layer {...conVisibilidad(capaRefugiosBase, v)} />
        <Layer {...conVisibilidad(capaRefugios, v)} />
        <Layer {...conVisibilidad(capaRefugiosEtiquetas, v)} />
      </Source>
    </>
  );
}
