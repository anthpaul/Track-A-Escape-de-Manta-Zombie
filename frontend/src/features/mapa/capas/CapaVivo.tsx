"use client";

import { useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { sobrevivientesAGeoJSON, zombiesAGeoJSON, zonasHordaAGeoJSON } from "../vivo";
import type { Grafo, Snapshot } from "../tipos";
import { capaSobrevivientes, capaZombies, capaZonasHorda } from "./estilos";
import { ICONOS_ZOMBIE, dibujarIcono, type TipoZombieVisible } from "./iconos";

type Props = { grafo: Grafo; snapshot: Snapshot };

// Live layers. Each snapshot only swaps the GeoJSON data of three sources (one setData each),
// never one React component per entity, so 200 survivors stay smooth.
export default function CapaVivo({ grafo, snapshot }: Props) {
  const { current: mapa } = useMap();

  useEffect(() => {
    if (!mapa) return;
    const registrar = () => {
      for (const tipo of Object.keys(ICONOS_ZOMBIE) as TipoZombieVisible[]) {
        const nombre = `zombie-${tipo}`;
        if (!mapa.hasImage(nombre)) mapa.addImage(nombre, dibujarIcono(tipo), { pixelRatio: 2 });
      }
    };
    registrar();
    // A style reload drops custom images; register them again when MapLibre asks for one.
    mapa.on("styleimagemissing", registrar);
    return () => {
      mapa.off("styleimagemissing", registrar);
    };
  }, [mapa]);

  const zonas = useMemo(() => zonasHordaAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sobrevivientes = useMemo(
    () => sobrevivientesAGeoJSON(grafo, snapshot.sobrevivientes),
    [grafo, snapshot.sobrevivientes],
  );
  const zombies = useMemo(() => zombiesAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);

  return (
    <>
      <Source id="zonas-horda" type="geojson" data={zonas}>
        <Layer {...capaZonasHorda} beforeId="calles" />
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
