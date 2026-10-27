"use client";

import MapaBase from "@/features/mapa/map/MapaBase";
import CapaGrafo from "@/features/mapa/map/layers/CapaGrafo";
import CapaVivo from "@/features/mapa/map/layers/CapaVivo";
import CapaSeleccion from "@/features/mapa/map/layers/CapaSeleccion";
import RegistroIconos from "@/features/mapa/map/layers/RegistroIconos";
import type { CapasVisibles } from "@/features/mapa/map/layers/visibilidad";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";

type Props = {
  grafo: Grafo;
  snapshot: Snapshot;
  aristasBloqueadas: ReadonlySet<string>;
  capas: CapasVisibles;
  anilloSobrevivienteId: string | null;
  refugioId: string | null;
  ruta: string[];
  onSeleccionarRefugio: (refugioId: string) => void;
  onSeleccionarSobreviviente: (sobrevivienteId: string) => void;
};

// Clicks prefer a shelter, then an on-road survivor, then a bitten one (they often share a node).
const PRIORIDAD = ["refugios", "refugios-base", "sobrevivientes", "mordidos"];

// Presentational map. Loaded as one client-only chunk; layers draw in mount order
// (streets, shelters, arrows and route, selection, horde zones, survivors, zombies on top).
export default function MapaVivo(props: Props) {
  const { grafo, snapshot, aristasBloqueadas, capas, anilloSobrevivienteId, refugioId, ruta } = props;
  return (
    <MapaBase
      capasInteractivas={PRIORIDAD}
      onClickEntidad={(entidades) => {
        const elegida = PRIORIDAD.map((capa) => entidades.find((e) => e.capa === capa)).find(Boolean);
        const id = elegida?.propiedades.id;
        if (typeof id !== "string") return;
        if (elegida!.capa.startsWith("refugios")) props.onSeleccionarRefugio(id);
        else props.onSeleccionarSobreviviente(id);
      }}
    >
      <RegistroIconos />
      <CapaGrafo grafo={grafo} aristasBloqueadas={aristasBloqueadas} refugiosVisibles={capas.refugio} />
      <CapaSeleccion
        grafo={grafo}
        snapshot={snapshot}
        anilloSobrevivienteId={anilloSobrevivienteId}
        refugioId={refugioId}
        ruta={ruta}
        flechasVisibles={capas.sobreviviente}
      />
      <CapaVivo grafo={grafo} snapshot={snapshot} capas={capas} />
    </MapaBase>
  );
}
