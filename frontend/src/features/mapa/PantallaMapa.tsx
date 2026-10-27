"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { grafoManta } from "@/features/mapa/data/real/grafo-manta";
import { useSimulacionMock } from "@/features/mapa/data/mock/useSimulacionMock";
import { USAR_MOCKS, useEstadoEnVivo } from "@/features/mapa/data/real/useEstadoEnVivo";
import { useRutaEnVivo } from "@/features/mapa/data/real/useRutaEnVivo";
import { rutaHaciaRefugio, type ConfigSimulacion } from "@/features/mapa/data/mock/simulacion";
import { derivarAlertas, type Alerta } from "@/features/mapa/domain/alertas";
import { estadoInicialPanel, reducirPanel, type Tab } from "@/features/mapa/domain/panel";
import { resumenPanel } from "@/features/mapa/domain/resumen";
import { elegirSeguido } from "@/features/mapa/domain/seleccion";
import type { Snapshot } from "@/features/mapa/domain/tipos";
import { conteosCapas, conteosFiltro, filtrarSobrevivientes, resumenRefugios } from "@/features/mapa/domain/vistas";
import LeyendaMapa from "@/features/mapa/ui/LeyendaMapa";
import MedidorFps from "@/features/mapa/ui/MedidorFps";
import PanelLateral from "@/features/mapa/ui/panel/PanelLateral";
import RielIconos from "@/features/mapa/ui/panel/RielIconos";
import ToastAlerta from "@/features/mapa/ui/panel/ToastAlerta";
import TabAlertas from "@/features/mapa/ui/panel/tabs/TabAlertas";
import TabCapas from "@/features/mapa/ui/panel/tabs/TabCapas";
import TabRefugios from "@/features/mapa/ui/panel/tabs/TabRefugios";
import TabSobrevivientes from "@/features/mapa/ui/panel/tabs/TabSobrevivientes";

// MapLibre needs window and WebGL, so it is never prerendered (ssr: false only works in Client Components).
const MapaVivo = dynamic(() => import("@/features/mapa/map/MapaVivo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background font-pixel text-sm text-muted-foreground">
      Cargando mapa de Manta…
    </div>
  ),
});

// R3-sized mock round (200 survivors) to check the map stays smooth at the real load.
const CONFIG_MOCK: ConfigSimulacion = { sobrevivientes: 200, caminantes: 12, corredores: 4, hordas: 2, semilla: 7 };
const TITULOS: Record<Tab, string> = { ref: "Refugios", surv: "Sobrevivientes", layers: "Capas", alert: "Alertas" };
const MAX_ALERTAS = 50;

// Container (the only one in the feature): picks the data sources, holds the panel state and wires
// map + panel.
export default function PantallaMapa() {
  // Real graph (T0.3) with live snapshots from GET /api/estado. While no game is running or the API
  // is unreachable, the in-browser simulation keeps the map moving and the panel marks it SIMULADO.
  const grafo = grafoManta;
  const vivo = useEstadoEnVivo(grafo, !USAR_MOCKS);
  const mock = useSimulacionMock(grafo, CONFIG_MOCK, vivo.snapshot === null);
  const snapshot = vivo.snapshot ?? mock;
  const esPrueba = vivo.snapshot === null;

  const [panel, dispatch] = useReducer(reducirPanel, undefined, estadoInicialPanel);
  const [abierto, setAbierto] = useState(true);

  // Alerts come from comparing each turn with the previous one; a new round starts a clean list.
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const previo = useRef<Snapshot | null>(null);
  // Turns restart in every round, so alert ids carry the round number: an alert from a new round
  // must never look already read just because an earlier round had the same event.
  // Switching between the live game and the simulation also starts clean: comparing a real turn
  // with a simulated one would invent hordes and bites that never happened.
  const numeroRonda = useRef(0);
  const previoEsPrueba = useRef(esPrueba);
  useEffect(() => {
    const cambioFuente = previoEsPrueba.current !== esPrueba;
    previoEsPrueba.current = esPrueba;
    const nuevaRonda = previo.current !== null && (cambioFuente || snapshot.turno < previo.current.turno);
    if (nuevaRonda) numeroRonda.current += 1;
    const nuevas = (nuevaRonda ? [] : derivarAlertas(grafo, previo.current, snapshot)).map((a) => ({
      ...a,
      id: `r${numeroRonda.current}:${a.id}`,
    }));
    previo.current = snapshot;
    if (nuevaRonda) setAlertas([]);
    if (nuevas.length === 0) return;
    setAlertas((actuales) => [...nuevas, ...actuales].slice(0, MAX_ALERTAS));
    dispatch({ tipo: "nuevaAlerta", id: nuevas[0].id });
  }, [grafo, snapshot, esPrueba]);

  const resumen = useMemo(() => resumenPanel(grafo, snapshot), [grafo, snapshot]);
  const refugios = useMemo(() => resumenRefugios(grafo, snapshot), [grafo, snapshot]);
  const conteoCapas = useMemo(() => conteosCapas(grafo, snapshot), [grafo, snapshot]);
  const lista = useMemo(
    () => filtrarSobrevivientes(grafo, snapshot.sobrevivientes, panel.busqueda, panel.filtro),
    [grafo, snapshot.sobrevivientes, panel.busqueda, panel.filtro],
  );
  const conteos = useMemo(
    () => conteosFiltro(grafo, snapshot.sobrevivientes, panel.busqueda),
    [grafo, snapshot.sobrevivientes, panel.busqueda],
  );
  const noLeidas = alertas.filter((a) => !panel.alertasLeidas.has(a.id)).length;
  const toastAlerta = alertas.find((a) => a.id === panel.toastAlertaId) ?? null;

  // A planned route is always on the map (plan A9): the selected survivor's while on the road,
  // otherwise the auto-followed one. The ring marks the selected survivor, or the followed one.
  const seleccionado = snapshot.sobrevivientes.find((s) => s.id === panel.sobrevivienteId) ?? null;
  const seguidoId = useMemo(
    () => elegirSeguido(snapshot.sobrevivientes, panel.sobrevivienteId),
    [snapshot.sobrevivientes, panel.sobrevivienteId],
  );
  // Live game: the route comes from the engine (K6). Simulation, or while the first real route loads:
  // a local shortest path, so a planned route is always visible (challenge requirement).
  const rutaReal = useRutaEnVivo(!esPrueba && panel.mostrarRuta ? (seguidoId ?? null) : null, snapshot.turno);
  const rutaLocal = useMemo(
    () => (panel.mostrarRuta && seguidoId ? rutaHaciaRefugio(grafo, snapshot, seguidoId) : []),
    [grafo, snapshot, seguidoId, panel.mostrarRuta],
  );
  const ruta = rutaReal ?? rutaLocal;

  // Same Set instance while the blocked list is unchanged, so street GeoJSON is not rebuilt every turn.
  const clave = snapshot.aristasBloqueadas.join(",");
  const aristasBloqueadas = useMemo(() => new Set(clave ? clave.split(",") : []), [clave]);

  // Tapping the active tab again folds the panel away (more map, mainly on phones).
  const elegirTab = (tab: Tab) => {
    if (abierto && panel.tab === tab) return setAbierto(false);
    dispatch({ tipo: "cambiarTab", tab });
    setAbierto(true);
  };
  const enviarYAbrir = (accion: Parameters<typeof dispatch>[0]) => {
    dispatch(accion);
    setAbierto(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-0 max-md:landscape:bottom-0 md:bottom-0">
        <MapaVivo
          grafo={grafo}
          snapshot={snapshot}
          aristasBloqueadas={aristasBloqueadas}
          capas={panel.capas}
          anilloSobrevivienteId={seleccionado?.id ?? seguidoId}
          refugioId={panel.refugioId}
          ruta={ruta}
          panelAbierto={abierto}
          onSeleccionarRefugio={(id) => enviarYAbrir({ tipo: "seleccionarRefugio", id })}
          onSeleccionarSobreviviente={(id) => enviarYAbrir({ tipo: "seleccionarSobreviviente", id })}
        />
        <LeyendaMapa />
      </div>

      <RielIconos
        tab={panel.tab}
        abierto={abierto}
        noLeidas={noLeidas}
        onElegir={elegirTab}
        onAlternarPanel={() => setAbierto((a) => !a)}
      />

      {abierto && (
        <PanelLateral titulo={TITULOS[panel.tab]} resumen={resumen} generadoEn={snapshot.generadoEn} conexion={vivo.conexion}>
          {panel.tab === "ref" && (
            <TabRefugios
              aSalvo={refugios.aSalvo}
              capacidadLibre={refugios.capacidadLibre}
              refugios={refugios.refugios}
              refugioId={panel.refugioId}
              mostrarRuta={panel.mostrarRuta}
              onSeleccionar={(id) => dispatch({ tipo: "seleccionarRefugio", id })}
              onAlternarRuta={() => dispatch({ tipo: "alternarRuta" })}
              onVerEnCamino={(nombreRefugio) => dispatch({ tipo: "verEnCamino", nombreRefugio })}
            />
          )}
          {panel.tab === "surv" && (
            <TabSobrevivientes
              grafo={grafo}
              lista={lista}
              conteos={conteos}
              busqueda={panel.busqueda}
              filtro={panel.filtro}
              seleccionado={seleccionado}
              onBuscar={(texto) => dispatch({ tipo: "buscar", texto })}
              onFiltrar={(filtro) => dispatch({ tipo: "filtrar", filtro })}
              onSeleccionar={(id) => dispatch({ tipo: "seleccionarSobreviviente", id })}
            />
          )}
          {panel.tab === "layers" && (
            <TabCapas
              capas={panel.capas}
              conteos={conteoCapas}
              mostrarRuta={panel.mostrarRuta}
              onAlternarCapa={(capa) => dispatch({ tipo: "alternarCapa", capa })}
              onAlternarRuta={() => dispatch({ tipo: "alternarRuta" })}
            />
          )}
          {panel.tab === "alert" && (
            <TabAlertas
              alertas={alertas}
              leidas={panel.alertasLeidas}
              onUbicar={(alerta) => dispatch({ tipo: "ubicarAlerta", alerta })}
              onMarcarLeida={(id) => dispatch({ tipo: "marcarLeida", id })}
            />
          )}
        </PanelLateral>
      )}

      <ToastAlerta
        alerta={toastAlerta}
        onVerAlertas={() => enviarYAbrir({ tipo: "abrirAlertas" })}
        onCerrar={() => dispatch({ tipo: "cerrarToast" })}
      />
      <MedidorFps />
    </div>
  );
}
