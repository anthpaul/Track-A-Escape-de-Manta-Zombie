"use client";

import { X } from "lucide-react";
import type { ChipResumen } from "@/features/mapa/domain/alertas";
import { horaDelTurno } from "@/features/mapa/domain/reloj";
import { VOZ_ALERTA } from "@/features/mapa/ui/panel/vocesAlerta";
import { cn } from "@/lib/utils";

type Props = { turno: number; chips: ChipResumen[]; onVerAlertas: () => void; onCerrar: () => void };

// Qué pasó en este turno, en una línea sobre el mapa, con el ícono de quien lo reporta (ver VOZ_ALERTA). Es lo más
// importante de la pantalla, así que va en tamaño legible. Queda cerrada tras pulsar × hasta que un turno traiga malas
// noticias otra vez (regla del reducer); las llegadas solas nunca la abren.
export default function BarraTurno({ turno, chips, onVerAlertas, onCerrar }: Props) {
  if (chips.length === 0) return null;
  return (
    <div
      role="status"
      className="flex max-w-full items-center gap-3 border-2 border-crimson-600 bg-crimson-100/95 py-2 pl-4 pr-2 text-sm text-calabaza-900 shadow-xl backdrop-blur sm:gap-4 sm:text-base"
    >
      <span className="shrink-0 font-pixel text-xs uppercase text-crimson-700">
        Turno {turno} · {horaDelTurno(turno).hora}
      </span>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        {chips.map((c) => {
          const { Icono, fondo } = VOZ_ALERTA[c.tipo];
          return (
            <li key={c.texto} className="inline-flex items-center gap-2 whitespace-nowrap font-semibold">
              <span className={cn("flex size-6 items-center justify-center", fondo)} aria-hidden>
                <Icono className="size-3.5 text-crimson-100" />
              </span>
              {c.texto}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onVerAlertas}
        className="shrink-0 bg-calabaza-500 px-3 py-1.5 font-semibold text-crimson-100 hover:bg-calabaza-800"
      >
        Ver qué pasó
      </button>
      <button type="button" onClick={onCerrar} aria-label="Cerrar resumen del turno" className="shrink-0 text-crimson-800 hover:text-calabaza-900">
        <X className="size-5" />
      </button>
    </div>
  );
}
