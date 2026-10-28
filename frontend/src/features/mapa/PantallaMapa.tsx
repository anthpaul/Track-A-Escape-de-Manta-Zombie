"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { grafoManta } from "@/features/mapa/data/real/grafo-manta";
import { useSimulacionMock } from "@/features/mapa/data/mock/useSimulacionMock";
import { USAR_MOCKS, useEstadoEnVivo } from "@/features/mapa/data/real/useEstadoEnVivo";
import { useRutaEnVivo } from "@/features/mapa/data/real/useRutaEnVivo";
import { rutaHaciaRefugio, type ConfigSimulacion } from "@/features/mapa/data/mock/simulacion";
import { alertasVisibles, derivarAlertas, esUrgente, resumenTurno, type Alerta } from "@/features/mapa/domain/alertas";
import { estadoInicialPanel, reducirPanel, type Tab } from "@/features/mapa/domain/panel";
import { resumenPanel } from "@/features/mapa/domain/resumen";
import { elegirSeguido } from "@/features/mapa/domain/seleccion";
import type { Snapshot } from "@/features/mapa/domain/tipos";
import { conteosCapas, conteosFiltro, filtrarSobrevivientes, resumenRefugios } from "@/features/mapa/domain/vistas";
import LeyendaMapa from "@/features/mapa/ui/LeyendaMapa";
import MedidorFps from "@/features/mapa/ui/MedidorFps";
import PanelLateral from "@/features/mapa/ui/panel/PanelLateral";
import RielIconos from "@/features/mapa/ui/panel/RielIconos";
import BarraTurno from "@/features/mapa/ui/panel/BarraTurno";
import IndicadorSeguimiento from "@/features/mapa/ui/panel/IndicadorSeguimiento";
import TabAlertas from "@/features/mapa/ui/panel/tabs/TabAlertas";
import TabCapas from "@/features/mapa/ui/panel/tabs/TabCapas";
import TabRefugios from "@/features/mapa/ui/panel/tabs/TabRefugios";
import TabSobrevivientes from "@/features/mapa/ui/panel/tabs/TabSobrevivientes";

// MapLibre necesita window y WebGL, así que nunca se prerenderiza (ssr: false solo funciona en Client Components).
const MapaVivo = dynamic(() => import("@/features/mapa/map/MapaVivo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background font-pixel text-sm text-muted-foreground">
      Cargando mapa de Manta…
    </div>
  ),
});

// Ronda simulada del tamaño de R3 (200 sobrevivientes) para comprobar que el mapa sigue fluido con la carga real.
const CONFIG_MOCK: ConfigSimulacion = { sobrevivientes: 200, caminantes: 12, corredores: 4, hordas: 2, semilla: 7 };
const TITULOS: Record<Tab, string> = { ref: "Refugios", surv: "Sobrevivientes", layers: "Capas", alert: "Alertas" };
const MAX_ALERTAS = 50;

// Container (el único de la feature): elige las fuentes de datos, guarda el estado del panel y conecta
// mapa + panel.
export default function PantallaMapa() {
  // Grafo real (T0.3) con snapshots en vivo de GET /api/estado. Mientras no haya partida en curso o la API
  // no responda, la simulación en el navegador mantiene el mapa en movimiento y el panel lo marca como SIMULADO.
  const grafo = grafoManta;
  const vivo = useEstadoEnVivo(grafo, !USAR_MOCKS);
  const mock = useSimulacionMock(grafo, CONFIG_MOCK, vivo.snapshot === null);
  const snapshot = vivo.snapshot ?? mock;
  const esPrueba = vivo.snapshot === null;

  const [panel, dispatch] = useReducer(reducirPanel, undefined, estadoInicialPanel);
  const [abierto, setAbierto] = useState(true);

  // Las alertas salen de comparar cada turno con el anterior; una ronda nueva empieza con la lista limpia.
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const previo = useRef<Snapshot | null>(null);
  // Los turnos se reinician en cada ronda, así que los ids de alerta llevan el número de ronda: una alerta de una ronda nueva
  // nunca debe parecer ya leída solo porque una ronda anterior tuvo el mismo evento.
  // Pasar de la partida en vivo a la simulación, o al revés, también empieza limpio: comparar un turno real
  // con uno simulado inventaría hordas y mordidas que nunca ocurrieron.
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
    // Solo las malas noticias abren la barra de turno; las llegadas solas solo se listan.
    const urgente = nuevas.find(esUrgente);
    if (urgente) dispatch({ tipo: "nuevaAlerta", id: urgente.id });
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
  const noLeidas = alertas.filter((a) => esUrgente(a) && !panel.alertasLeidas.has(a.id)).length;
  const toastAlerta = alertas.find((a) => a.id === panel.toastAlertaId) ?? null;

  // Siempre hay una ruta planificada en el mapa (plan A9): la del sobreviviente seleccionado mientras siga en camino;
  // si no, la del seguido automáticamente. El anillo marca al sobreviviente seleccionado o, si no hay, al seguido.
  const seleccionado = snapshot.sobrevivientes.find((s) => s.id === panel.sobrevivienteId) ?? null;
  const seguidoId = useMemo(
    () => elegirSeguido(snapshot.sobrevivientes, panel.sobrevivienteId),
    [snapshot.sobrevivientes, panel.sobrevivienteId],
  );
  // Partida en vivo: la ruta viene del motor (K6). En la simulación, o mientras carga la primera ruta real:
  // un camino más corto local, así siempre hay una ruta planificada visible (requisito del reto).
  const rutaReal = useRutaEnVivo(!esPrueba && panel.mostrarRuta ? (seguidoId ?? null) : null, snapshot.turno);
  const rutaLocal = useMemo(
    () => (panel.mostrarRuta && seguidoId ? rutaHaciaRefugio(grafo, snapshot, seguidoId) : []),
    [grafo, snapshot, seguidoId, panel.mostrarRuta],
  );
  const ruta = rutaReal ?? rutaLocal;
  const seguido = snapshot.sobrevivientes.find((s) => s.id === (seleccionado?.id ?? seguidoId)) ?? null;
  const refugioSeguido = seguido?.refugio ? (grafo.refugios.find((r) => r.id === seguido.refugio)?.nombre ?? null) : null;

  // La misma instancia de Set mientras la lista de bloqueadas no cambie, para no reconstruir el GeoJSON de calles en cada turno.
  const clave = snapshot.aristasBloqueadas.join(",");
  const aristasBloqueadas = useMemo(() => new Set(clave ? clave.split(",") : []), [clave]);

  // Tocar otra vez la pestaña activa pliega el panel (más mapa, sobre todo en teléfonos).
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
              alertas={alertasVisibles(alertas, snapshot.turno)}
              turnoActual={snapshot.turno}
              leidas={panel.alertasLeidas}
              onUbicar={(alerta) => dispatch({ tipo: "ubicarAlerta", alerta })}
            />
          )}
        </PanelLateral>
      )}

      {/* Arriba y al centro, apilados: qué pasó en el turno y a quién sigue el mapa. */}
      <div className="pointer-events-none absolute left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col items-center gap-2 [&>*]:pointer-events-auto">
        {toastAlerta && (
          <BarraTurno
            turno={toastAlerta.turno}
            chips={resumenTurno(alertas, toastAlerta.turno)}
            onVerAlertas={() => enviarYAbrir({ tipo: "abrirAlertas" })}
            onCerrar={() => dispatch({ tipo: "cerrarToast" })}
          />
        )}
        {seguido && (
          <IndicadorSeguimiento
            sobrevivienteId={seguido.id}
            estado={seguido.estado}
            automatico={!seleccionado}
            refugio={refugioSeguido}
            calles={ruta.length > 1 ? ruta.length - 1 : null}
            onVer={() => enviarYAbrir({ tipo: "seleccionarSobreviviente", id: seguido.id })}
          />
        )}
      </div>
      <MedidorFps />
    </div>
  );
}
