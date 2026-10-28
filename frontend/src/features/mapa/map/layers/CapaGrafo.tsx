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

// Capas del grafo estático: la red caminable (coloreada por tipo, en rojo si está bloqueada, puentes dañados
// punteados) y los refugios. Las señales de tránsito viven en CapaSenales, dibujadas encima de todo.
// Las calles no se pueden apagar: las calles bloqueadas son un requisito del mapa en vivo.
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
