"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { sobrevivientesAGeoJSON, zombiesAGeoJSON, zonasHordaAGeoJSON } from "../vivo";
import type { Grafo, Snapshot } from "../tipos";
import { capaSobrevivientes, capaZombies, capaZonasHorda } from "./estilos";

type Props = { grafo: Grafo; snapshot: Snapshot };

// Live layers. Each snapshot only swaps the GeoJSON data of three sources (one setData each),
// never one React component per entity, so 200 survivors stay smooth.
export default function CapaVivo({ grafo, snapshot }: Props) {
  const zonas = useMemo(() => zonasHordaAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sobrevivientes = useMemo(
    () => sobrevivientesAGeoJSON(grafo, snapshot.sobrevivientes),
    [grafo, snapshot.sobrevivientes],
  );
  const zombies = useMemo(() => zombiesAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);

  return (
    <>
      <Source id="zonas-horda" type="geojson" data={zonas}>
        <Layer {...capaZonasHorda} />
      </Source>
      <Source id="sobrevivientes" type="geojson" data={sobrevivientes}>
        <Layer {...capaSobrevivientes} />
      </Source>
      <Source id="zombies" type="geojson" data={zombies}>
        <Layer {...capaZombies} />
      </Source>
    </>
  );
}
