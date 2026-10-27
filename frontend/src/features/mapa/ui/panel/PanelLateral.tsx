"use client";

import { Activity, FlaskConical, HeartPulse, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NivelLatencia, ResumenPanel } from "@/features/mapa/domain/resumen";
import type { Conexion } from "@/features/mapa/domain/tipos";
import IndicadorEnVivo from "./IndicadorEnVivo";

type Props = {
  titulo: string;
  resumen: ResumenPanel;
  generadoEn: string;
  conexion: Conexion;
  children: React.ReactNode;
};

const CLASE_LATENCIA: Record<NivelLatencia, string> = {
  excelente: "text-marea-700",
  bueno: "text-calabaza-500",
  limite: "text-otono-500",
  fuera: "text-sangre-700",
  sin_datos: "text-crimson-800",
};

// Side panel: tab title, round and turn, plus the live indicator, p95 and survival rate the
// challenge cares about, always visible whatever the tab. Bottom sheet on phones.
// Why the panel is not showing the live game: the operator must never mistake the simulation for it.
const AVISO: Record<Exclude<Conexion, "en_vivo">, { texto: string; detalle: string; Icono: LucideIcon; clase: string }> = {
  simulado: { texto: "SIMULADO", detalle: "Simulación local, sin API", Icono: FlaskConical, clase: "bg-crimson-500 text-calabaza-900" },
  conectando: { texto: "CONECTANDO · SIMULADO", detalle: "Esperando la primera respuesta de /api/estado", Icono: RefreshCw, clase: "bg-crimson-500 text-calabaza-900" },
  reconectando: { texto: "RECONECTANDO", detalle: "La última consulta falló: se muestra el último turno real", Icono: RefreshCw, clase: "bg-otono-500 text-crimson-100" },
  sin_partida: { texto: "SIN PARTIDA · SIMULADO", detalle: "La API responde, pero no hay ninguna ronda en curso", Icono: FlaskConical, clase: "bg-crimson-500 text-calabaza-900" },
  sin_conexion: { texto: "SIN CONEXIÓN · SIMULADO", detalle: "La API no responde o su respuesta no cumple el contrato", Icono: WifiOff, clase: "bg-sangre-700 text-crimson-100" },
};

export default function PanelLateral({ titulo, resumen, generadoEn, conexion, children }: Props) {
  const aviso = conexion === "en_vivo" ? null : AVISO[conexion];
  return (
    <section
      id="panel-mapa"
      aria-label={titulo}
      // Sizes mirror map/padding.ts (DISENO).
      className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex max-h-[50dvh] flex-col gap-3.5 rounded-t-2xl border-t border-crimson-300 bg-crimson-200/95 p-5 backdrop-blur max-md:landscape:inset-y-0 max-md:landscape:bottom-0 max-md:landscape:left-14 max-md:landscape:right-auto max-md:landscape:max-h-none max-md:landscape:w-72 max-md:landscape:gap-2.5 max-md:landscape:rounded-none max-md:landscape:border-r max-md:landscape:border-t-0 max-md:landscape:p-3 md:inset-y-0 md:bottom-0 md:left-16 md:right-auto md:max-h-none md:w-[300px] md:rounded-none md:border-r md:border-t-0 xl:w-[340px]"
    >
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-pixel text-xl uppercase text-calabaza-500">{titulo}</h2>
          <span className="font-pixel text-xs text-crimson-800">
            R{resumen.ronda} · T{resumen.turno}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {/* Only real snapshots get "EN VIVO": simulated turns are always fresh, so their age proves nothing. */}
          {(conexion === "en_vivo" || conexion === "reconectando") && <IndicadorEnVivo generadoEn={generadoEn} />}
          <span className="inline-flex items-center gap-1 text-calabaza-900">
            <HeartPulse className="size-3.5 text-crimson-700" aria-hidden />
            {resumen.supervivenciaPct}%
          </span>
          <span className={cn("inline-flex items-center gap-1", CLASE_LATENCIA[resumen.latencia.nivel])}>
            <Activity className="size-3.5" aria-hidden />
            p95 {resumen.p95ms === null ? "—" : `${Math.round(resumen.p95ms)} ms`}
          </span>
          {aviso && (
            <span title={aviso.detalle} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-pixel text-[9px]", aviso.clase)}>
              <aviso.Icono className="size-3" aria-hidden />
              {aviso.texto}
            </span>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </section>
  );
}
