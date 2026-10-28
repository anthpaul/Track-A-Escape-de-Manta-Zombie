"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChipResumen, TonoResumen } from "@/features/mapa/domain/alertas";

type Props = { turno: number; chips: ChipResumen[]; onVerAlertas: () => void; onCerrar: () => void };

const COLOR_TONO: Record<TonoResumen, string> = {
  mordido: "bg-crimson-700",
  peligro: "bg-sangre-700",
  aviso: "bg-calabaza-500",
  llegada: "bg-marea-700",
};

// Qué pasó en este turno, en una línea sobre el mapa. Queda cerrada tras pulsar × hasta que un turno traiga malas
// noticias otra vez (regla del reducer); las llegadas solas nunca la abren.
export default function BarraTurno({ turno, chips, onVerAlertas, onCerrar }: Props) {
  if (chips.length === 0) return null;
  return (
    <div
      role="status"
      className="absolute left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-crimson-600 bg-crimson-100/95 py-1.5 pl-4 pr-2 text-xs text-calabaza-900 shadow-xl backdrop-blur"
    >
      <span className="shrink-0 font-pixel text-[10px] uppercase text-crimson-700">Turno {turno}</span>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {chips.map((c) => (
          <li key={c.texto} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn("size-2 rounded-full", COLOR_TONO[c.tono])} aria-hidden />
            {c.texto}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onVerAlertas}
        className="shrink-0 rounded-full bg-calabaza-500 px-3 py-1 font-semibold text-crimson-100 hover:bg-calabaza-800"
      >
        Ver qué pasó
      </button>
      <button type="button" onClick={onCerrar} aria-label="Cerrar resumen del turno" className="shrink-0 text-crimson-800 hover:text-calabaza-900">
        <X className="size-4" />
      </button>
    </div>
  );
}
