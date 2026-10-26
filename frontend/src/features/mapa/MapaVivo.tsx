"use client";

import MapaBase from "./MapaBase";
import CapaGrafo from "./capas/CapaGrafo";
import CapaVivo from "./capas/CapaVivo";
import type { Grafo, Snapshot } from "./tipos";

type Props = { grafo: Grafo; snapshot: Snapshot; aristasBloqueadas: ReadonlySet<string> };

// Presentational map. Loaded as one client-only chunk so layers always mount in order:
// the horde zones are inserted below "calles", which must already exist.
export default function MapaVivo({ grafo, snapshot, aristasBloqueadas }: Props) {
  return (
    <MapaBase>
      <CapaGrafo grafo={grafo} aristasBloqueadas={aristasBloqueadas} />
      <CapaVivo grafo={grafo} snapshot={snapshot} />
    </MapaBase>
  );
}
