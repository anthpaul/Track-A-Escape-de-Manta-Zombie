"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import {
  refugiosSinAccesoAGeoJSON,
  sobrevivientesAGeoJSON,
  vehiculosAGeoJSON,
  zombiesAGeoJSON,
  zonasHordaAGeoJSON,
} from "@/features/mapa/map/geojson/entidades";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import {
  capaMordidos,
  capaRefugiosSinAcceso,
  capaRefugiosSinAccesoEtiqueta,
  capaSobrevivientes,
  capaVehiculos,
  capaZombies,
  capaZonasHorda,
} from "@/features/mapa/map/layers/estilos";
import { conFiltro, conVisibilidad, filtroZombies, type CapasVisibles } from "./visibilidad";

type Props = { grafo: Grafo; snapshot: Snapshot; capas: CapasVisibles };

// Live layers. Each snapshot only swaps the GeoJSON data of four sources (one setData each),
// never one React component per entity, so 200 survivors stay smooth. Switched-off layers are
// hidden by visibility or filter, without rebuilding any source.
export default function CapaVivo({ grafo, snapshot, capas }: Props) {
  const zonas = useMemo(() => zonasHordaAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sobrevivientes = useMemo(
    () => sobrevivientesAGeoJSON(grafo, snapshot.sobrevivientes),
    [grafo, snapshot.sobrevivientes],
  );
  const zombies = useMemo(() => zombiesAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sinAcceso = useMemo(() => refugiosSinAccesoAGeoJSON(grafo, snapshot), [grafo, snapshot]);
  const vehiculos = useMemo(() => vehiculosAGeoJSON(grafo, snapshot.vehiculos), [grafo, snapshot.vehiculos]);

  return (
    <>
      <Source id="zonas-horda" type="geojson" data={zonas}>
        <Layer {...conVisibilidad(capaZonasHorda, capas.horda)} />
      </Source>
      <Source id="refugios-sin-acceso" type="geojson" data={sinAcceso}>
        <Layer {...conVisibilidad(capaRefugiosSinAcceso, capas.refugio)} />
        <Layer {...conVisibilidad(capaRefugiosSinAccesoEtiqueta, capas.refugio)} />
      </Source>
      <Source id="sobrevivientes" type="geojson" data={sobrevivientes}>
        <Layer {...conVisibilidad(capaSobrevivientes, capas.sobreviviente)} />
        <Layer {...conVisibilidad(capaMordidos, capas.mordido)} />
      </Source>
      {/* Rescue vans travel with the people layer: hiding survivors hides who carries them too. */}
      <Source id="vehiculos" type="geojson" data={vehiculos}>
        <Layer {...conVisibilidad(capaVehiculos, capas.sobreviviente)} />
      </Source>
      <Source id="zombies" type="geojson" data={zombies}>
        <Layer {...conFiltro(capaZombies, filtroZombies(capas))} />
      </Source>
    </>
  );
}
