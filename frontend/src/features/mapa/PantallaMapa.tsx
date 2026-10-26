"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { grafoMini } from "@/features/mapa/data/mock/grafo-mini";
import { useSimulacionMock } from "@/features/mapa/data/mock/useSimulacionMock";
import { rutaHaciaRefugio, type ConfigSimulacion } from "@/features/mapa/data/mock/simulacion";
import MedidorFps from "@/features/mapa/ui/MedidorFps";
import { resumenPanel } from "@/features/mapa/domain/resumen";
import { elegirSeguido } from "@/features/mapa/domain/seleccion";
import Sidebar from "@/features/mapa/ui/sidebar/Sidebar";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaVivo = dynamic(() => import("@/features/mapa/map/MapaVivo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
      Cargando mapa de Manta…
    </div>
  ),
});

// R3-sized mock round (200 survivors) to check the map stays smooth at the real load.
const CONFIG_MOCK: ConfigSimulacion = { sobrevivientes: 200, caminantes: 4, corredores: 2, hordas: 1, semilla: 7 };

// Container (the only one in the feature): picks the data sources and wires map + sidebar.
// Mock graph and mock snapshots until manta.json (T0.3)
// and GET /api/estado (S5) exist; N4 swaps the hook for real polling.
export default function PantallaMapa() {
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

  // Desktop only: the side panel can be hidden to give the map the whole screen.
  // MapLibre follows its container size on its own (ResizeObserver).
  const [panelAbierto, setPanelAbierto] = useState(true);

  return (
    // Phone: map on top, panel below. Desktop: map on the left, panel as a right sidebar.
    <div className="flex h-full w-full flex-col md:flex-row">
      <div className="relative h-[55dvh] shrink-0 md:h-full md:min-w-0 md:flex-1">
        <MapaVivo
          grafo={grafo}
          snapshot={snapshot}
          aristasBloqueadas={aristasBloqueadas}
          seguidoId={seguidoId}
          ruta={ruta}
          onSeleccionar={setPreferido}
        />
        {!panelAbierto && (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setPanelAbierto(true)}
            aria-label="Mostrar panel"
            className="absolute right-3 top-3 hidden shadow-lg md:inline-flex"
          >
            <PanelRightOpen aria-hidden />
          </Button>
        )}
        <MedidorFps />
      </div>
      <div className={panelAbierto ? "flex min-h-0 flex-1 md:flex-none" : "flex min-h-0 flex-1 md:hidden"}>
        <Sidebar
          grafo={grafo}
          resumen={resumen}
          seguido={seguido}
          ruta={ruta}
          elegidoAMano={seguidoId !== null && seguidoId === preferido}
          esPrueba={esPrueba}
          onCerrar={() => setPanelAbierto(false)}
        />
      </div>
    </div>
  );
}
