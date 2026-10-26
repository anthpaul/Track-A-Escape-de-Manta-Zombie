"use client";

import MapaBase from "./MapaBase";
import CapaGrafo from "./capas/CapaGrafo";
import CapaVivo from "./capas/CapaVivo";
import type { Grafo, Snapshot } from "./tipos";

type Props = { grafo: Grafo; snapshot: Snapshot; aristasBloqueadas: ReadonlySet<string> };

// Presentational map. Loaded as one client-only chunk; layers draw in mount order
// (streets, shelters, horde zones, survivors, zombies on top).
export default function MapaVivo({ grafo, snapshot, aristasBloqueadas }: Props) {
  return (
    <MapaBase>
      <CapaGrafo grafo={grafo} aristasBloqueadas={aristasBloqueadas} />
      <CapaVivo grafo={grafo} snapshot={snapshot} />
    </MapaBase>
  );
}
