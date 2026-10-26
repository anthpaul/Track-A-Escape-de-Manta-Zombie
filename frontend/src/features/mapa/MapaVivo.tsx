"use client";

import MapaBase from "./MapaBase";
import CapaGrafo from "./capas/CapaGrafo";
import CapaVivo from "./capas/CapaVivo";
import CapaSeleccion from "./capas/CapaSeleccion";
import RegistroIconos from "./capas/RegistroIconos";
import type { Grafo, Snapshot } from "./tipos";

type Props = {
  grafo: Grafo;
  snapshot: Snapshot;
  aristasBloqueadas: ReadonlySet<string>;
  seguidoId: string | null;
  ruta: string[];
  onSeleccionar: (sobrevivienteId: string) => void;
};

// Presentational map. Loaded as one client-only chunk; layers draw in mount order
// (streets, shelters, arrows and route, horde zones, survivors, zombies on top).
export default function MapaVivo({ grafo, snapshot, aristasBloqueadas, seguidoId, ruta, onSeleccionar }: Props) {
  return (
    <MapaBase
      capasInteractivas={["sobrevivientes"]}
      onClickEntidad={(entidades) => {
        // Bitten survivors share nodes with on-road ones; only an on-road survivor has a route to follow.
        const enRuta = entidades.find((e) => e.propiedades.estado === "en_ruta");
        if (typeof enRuta?.propiedades.id === "string") onSeleccionar(enRuta.propiedades.id);
      }}
    >
      <RegistroIconos />
      <CapaGrafo grafo={grafo} aristasBloqueadas={aristasBloqueadas} />
      <CapaSeleccion grafo={grafo} snapshot={snapshot} seguidoId={seguidoId} ruta={ruta} />
      <CapaVivo grafo={grafo} snapshot={snapshot} />
    </MapaBase>
  );
}
