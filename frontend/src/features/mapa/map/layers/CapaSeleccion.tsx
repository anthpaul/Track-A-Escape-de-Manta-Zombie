"use client";

import { useMemo } from "react";
import type { FeatureCollection, Point } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import { flechasAGeoJSON, rutaAGeoJSON } from "@/features/mapa/map/geojson/rutas";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import { capaFlechasLineas, capaFlechasPuntas, capaRuta, capaSeguido } from "@/features/mapa/map/layers/estilos";

type Props = { grafo: Grafo; snapshot: Snapshot; seguidoId: string | null; ruta: string[] };

// "Planned route" layers: an arrow per direction for everyone, and the full route of the followed survivor.
export default function CapaSeleccion({ grafo, snapshot, seguidoId, ruta }: Props) {
  const flechas = useMemo(() => flechasAGeoJSON(grafo, snapshot.sobrevivientes), [grafo, snapshot.sobrevivientes]);
  const lineaRuta = useMemo(() => rutaAGeoJSON(grafo, ruta), [grafo, ruta]);
  const seguido = useMemo((): FeatureCollection<Point> => {
    const s = snapshot.sobrevivientes.find((x) => x.id === seguidoId);
    const nodo = s && grafo.nodos.find((n) => n.id === s.nodo);
    return {
      type: "FeatureCollection",
      features: nodo ? [{ type: "Feature", geometry: { type: "Point", coordinates: [nodo.lng, nodo.lat] }, properties: {} }] : [],
    };
  }, [grafo, snapshot.sobrevivientes, seguidoId]);

  return (
    <>
      <Source id="flechas-lineas" type="geojson" data={flechas.lineas}>
        <Layer {...capaFlechasLineas} />
      </Source>
      <Source id="flechas-puntas" type="geojson" data={flechas.puntas}>
        <Layer {...capaFlechasPuntas} />
      </Source>
      <Source id="ruta" type="geojson" data={lineaRuta}>
        <Layer {...capaRuta} />
      </Source>
      <Source id="seguido" type="geojson" data={seguido}>
        <Layer {...capaSeguido} />
      </Source>
    </>
  );
}
