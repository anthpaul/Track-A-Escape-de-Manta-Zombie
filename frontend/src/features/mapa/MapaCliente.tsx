"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { grafoMini } from "./mocks/grafo-mini";
import { useSimulacionMock } from "./mocks/useSimulacionMock";
import { rutaHaciaRefugio, type ConfigSimulacion } from "./mocks/simulacion";
import MedidorFps from "./MedidorFps";
import PanelMetricas from "./PanelMetricas";
import Leyenda from "./Leyenda";
import { resumenPanel } from "./panel";
import { elegirSeguido } from "./seleccion";
import TarjetaSobreviviente from "./TarjetaSobreviviente";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaVivo = dynamic(() => import("./MapaVivo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
      Cargando mapa de Manta…
    </div>
  ),
});

// R3-sized mock round (200 survivors) to check the map stays smooth at the real load.
const CONFIG_MOCK: ConfigSimulacion = { sobrevivientes: 200, caminantes: 4, corredores: 2, hordas: 1, semilla: 7 };

// Container: picks the data sources. Mock graph and mock snapshots until manta.json (T0.3)
// and GET /api/estado (S5) exist; N4 swaps the hook for real polling.
export default function MapaCliente() {
  const grafo = grafoMini;
  const snapshot = useSimulacionMock(grafo, CONFIG_MOCK);
  const esPrueba = grafo.version.startsWith("mock");

  // Same Set instance while the blocked list is unchanged, so street GeoJSON is not rebuilt every turn.
  const clave = snapshot.aristasBloqueadas.join(",");
  const aristasBloqueadas = useMemo(() => new Set(clave ? clave.split(",") : []), [clave]);
  const resumen = useMemo(() => resumenPanel(grafo, snapshot), [grafo, snapshot]);

  // There is always a followed survivor with a visible planned route (plan A9): the one picked
  // on the map while it is on the road, otherwise the lowest on-road id.
  const [preferido, setPreferido] = useState<string | null>(null);
  const seguidoId = useMemo(() => elegirSeguido(snapshot.sobrevivientes, preferido), [snapshot.sobrevivientes, preferido]);
  // Mock of GET /api/sobrevivientes/:id/ruta (K6); N4 replaces it with the real endpoint.
  const ruta = useMemo(() => (seguidoId ? rutaHaciaRefugio(grafo, snapshot, seguidoId) : []), [grafo, snapshot, seguidoId]);
  const seguido = snapshot.sobrevivientes.find((s) => s.id === seguidoId) ?? null;

  return (
    <div className="relative h-full w-full">
      <MapaVivo
        grafo={grafo}
        snapshot={snapshot}
        aristasBloqueadas={aristasBloqueadas}
        seguidoId={seguidoId}
        ruta={ruta}
        onSeleccionar={setPreferido}
      />
      {esPrueba && (
        <span className="absolute left-3 top-3 rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black">
          Datos de prueba
        </span>
      )}
      <PanelMetricas resumen={resumen} />
      <TarjetaSobreviviente grafo={grafo} sobreviviente={seguido} ruta={ruta} elegidoAMano={seguidoId !== null && seguidoId === preferido} />
      <Leyenda />
      <MedidorFps />
    </div>
  );
}
