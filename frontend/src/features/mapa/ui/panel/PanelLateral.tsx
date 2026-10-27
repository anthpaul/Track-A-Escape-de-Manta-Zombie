"use client";

import { Activity, FlaskConical, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NivelLatencia, ResumenPanel } from "@/features/mapa/domain/resumen";
import IndicadorEnVivo from "./IndicadorEnVivo";

type Props = {
  titulo: string;
  resumen: ResumenPanel;
  generadoEn: string;
  esPrueba: boolean;
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
export default function PanelLateral({ titulo, resumen, generadoEn, esPrueba, children }: Props) {
  return (
    <section
      aria-label={titulo}
      className="absolute inset-x-0 bottom-16 z-20 flex max-h-[50dvh] flex-col gap-3.5 rounded-t-2xl border-t border-crimson-300 bg-crimson-200/95 p-5 backdrop-blur md:inset-y-0 md:bottom-auto md:left-16 md:right-auto md:max-h-none md:w-[300px] md:rounded-none md:border-r md:border-t-0"
    >
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-pixel text-xl uppercase text-calabaza-500">{titulo}</h2>
          <span className="font-pixel text-xs text-crimson-800">
            R{resumen.ronda} · T{resumen.turno}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <IndicadorEnVivo generadoEn={generadoEn} />
          <span className="inline-flex items-center gap-1 text-calabaza-900">
            <HeartPulse className="size-3.5 text-crimson-700" aria-hidden />
            {resumen.supervivenciaPct}%
          </span>
          <span className={cn("inline-flex items-center gap-1", CLASE_LATENCIA[resumen.latencia.nivel])}>
            <Activity className="size-3.5" aria-hidden />
            p95 {resumen.p95ms === null ? "—" : `${Math.round(resumen.p95ms)} ms`}
          </span>
          {esPrueba && (
            <span className="inline-flex items-center gap-1 rounded bg-crimson-500 px-1.5 py-0.5 font-pixel text-[9px] text-calabaza-900">
              <FlaskConical className="size-3" aria-hidden />
              SIMULADO
            </span>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </section>
  );
}
