"use client";

import { useMemo } from "react";
import type { FeatureCollection, Point } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import { flechasAGeoJSON, rutaAGeoJSON } from "@/features/mapa/map/geojson/rutas";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import {
  capaFlechasLineas,
  capaFlechasPuntas,
  capaRefugioSeleccionado,
  capaRuta,
  capaSeguido,
  capaSeguidoEtiqueta,
} from "@/features/mapa/map/layers/estilos";
import { conVisibilidad } from "./visibilidad";

type Props = {
  grafo: Grafo;
  snapshot: Snapshot;
  anilloSobrevivienteId: string | null;
  refugioId: string | null;
  ruta: string[];
  flechasVisibles: boolean;
};

const punto = (lng: number, lat: number, properties: Record<string, string>): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties }],
});
const vacio: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

// "Planned route" and selection layers: an arrow per direction for everyone, the dashed route of the
// followed survivor, and rings with labels around the selected survivor and shelter.
export default function CapaSeleccion({ grafo, snapshot, anilloSobrevivienteId, refugioId, ruta, flechasVisibles }: Props) {
  const flechas = useMemo(() => flechasAGeoJSON(grafo, snapshot.sobrevivientes), [grafo, snapshot.sobrevivientes]);
  const lineaRuta = useMemo(() => rutaAGeoJSON(grafo, ruta), [grafo, ruta]);

  const anilloSobreviviente = useMemo(() => {
    const s = snapshot.sobrevivientes.find((x) => x.id === anilloSobrevivienteId);
    const nodo = s && grafo.nodos.find((n) => n.id === s.nodo);
    return nodo ? punto(nodo.lng, nodo.lat, { id: s.id }) : vacio;
  }, [grafo, snapshot.sobrevivientes, anilloSobrevivienteId]);

  const anilloRefugio = useMemo(() => {
    const r = grafo.refugios.find((x) => x.id === refugioId);
    const nodo = r && grafo.nodos.find((n) => n.id === r.nodo);
    return nodo ? punto(nodo.lng, nodo.lat, { nombre: r.nombre }) : vacio;
  }, [grafo, refugioId]);

  const v = flechasVisibles;

  return (
    <>
      <Source id="flechas-lineas" type="geojson" data={flechas.lineas}>
        <Layer {...conVisibilidad(capaFlechasLineas, v)} />
      </Source>
      <Source id="flechas-puntas" type="geojson" data={flechas.puntas}>
        <Layer {...conVisibilidad(capaFlechasPuntas, v)} />
      </Source>
      <Source id="ruta" type="geojson" data={lineaRuta}>
        <Layer {...capaRuta} />
      </Source>
      <Source id="seguido" type="geojson" data={anilloSobreviviente}>
        <Layer {...capaSeguido} />
        <Layer {...capaSeguidoEtiqueta} />
      </Source>
      <Source id="refugio-seleccionado" type="geojson" data={anilloRefugio}>
        <Layer {...capaRefugioSeleccionado} />
      </Source>
    </>
  );
}
