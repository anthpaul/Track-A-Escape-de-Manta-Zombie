"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import {
  ocupacionRefugiosAGeoJSON,
  refugiosSinAccesoAGeoJSON,
  sobrevivientesAGeoJSON,
  vehiculosAGeoJSON,
  zombiesAGeoJSON,
  zonasHordaAGeoJSON,
} from "@/features/mapa/map/geojson/entidades";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";
import {
  capaMordidos,
  capaRefugiosOcupacion,
  capaRefugiosSinAcceso,
  capaRefugiosSinAccesoEtiqueta,
  capaSobrevivientes,
  capaVehiculos,
  capaZombies,
  capaZonasHorda,
} from "@/features/mapa/map/layers/estilos";
import { conFiltro, conVisibilidad, filtroZombies, type CapasVisibles } from "./visibilidad";

type Props = { grafo: Grafo; snapshot: Snapshot; capas: CapasVisibles };

// Capas en vivo. Cada snapshot solo reemplaza los datos GeoJSON de cuatro fuentes (un setData por fuente),
// nunca un componente React por entidad, así 200 sobrevivientes se mueven con fluidez. Las capas apagadas se
// ocultan por visibility o por filtro, sin reconstruir ninguna fuente.
export default function CapaVivo({ grafo, snapshot, capas }: Props) {
  const zonas = useMemo(() => zonasHordaAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sobrevivientes = useMemo(
    () => sobrevivientesAGeoJSON(grafo, snapshot.sobrevivientes),
    [grafo, snapshot.sobrevivientes],
  );
  const zombies = useMemo(() => zombiesAGeoJSON(grafo, snapshot.zombies), [grafo, snapshot.zombies]);
  const sinAcceso = useMemo(() => refugiosSinAccesoAGeoJSON(grafo, snapshot), [grafo, snapshot]);
  const ocupacion = useMemo(() => ocupacionRefugiosAGeoJSON(grafo, snapshot.refugios), [grafo, snapshot.refugios]);
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
      <Source id="refugios-ocupacion" type="geojson" data={ocupacion}>
        <Layer {...conVisibilidad(capaRefugiosOcupacion, capas.refugio)} />
      </Source>
      <Source id="sobrevivientes" type="geojson" data={sobrevivientes}>
        <Layer {...conVisibilidad(capaSobrevivientes, capas.sobreviviente)} />
        <Layer {...conVisibilidad(capaMordidos, capas.mordido)} />
      </Source>
      {/* Las camionetas de rescate van con la capa de personas: ocultar a los sobrevivientes también oculta a quien los lleva. */}
      <Source id="vehiculos" type="geojson" data={vehiculos}>
        <Layer {...conVisibilidad(capaVehiculos, capas.sobreviviente)} />
      </Source>
      <Source id="zombies" type="geojson" data={zombies}>
        <Layer {...conFiltro(capaZombies, filtroZombies(capas))} />
      </Source>
    </>
  );
}
