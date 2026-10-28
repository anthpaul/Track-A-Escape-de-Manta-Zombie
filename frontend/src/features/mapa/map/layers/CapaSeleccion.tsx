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
import { etiquetaPersona } from "@/features/mapa/domain/lugares";

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

// Capas de "ruta planificada" y de selección: una flecha por dirección para todos, la ruta punteada del
// sobreviviente seguido y anillos con etiquetas alrededor del sobreviviente y del refugio seleccionados.
export default function CapaSeleccion({ grafo, snapshot, anilloSobrevivienteId, refugioId, ruta, flechasVisibles }: Props) {
  const flechas = useMemo(() => flechasAGeoJSON(grafo, snapshot.sobrevivientes), [grafo, snapshot.sobrevivientes]);
  const lineaRuta = useMemo(() => rutaAGeoJSON(grafo, ruta), [grafo, ruta]);

  const anilloSobreviviente = useMemo(() => {
    const s = snapshot.sobrevivientes.find((x) => x.id === anilloSobrevivienteId);
    const nodo = s && grafo.nodos.find((n) => n.id === s.nodo);
    // "Sobreviviente 3" en el mapa, nunca el código del contrato S-0003; su estado colorea el anillo y la etiqueta.
    return nodo ? punto(nodo.lng, nodo.lat, { id: s.id, estado: s.estado, nombre: etiquetaPersona(s.id, s.estado) }) : vacio;
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
