"use client";

import { cn } from "@/lib/utils";
import type { Alerta } from "@/features/mapa/domain/alertas";
import { horaDelTurno } from "@/features/mapa/domain/reloj";
import { VOZ_ALERTA } from "@/features/mapa/ui/panel/vocesAlerta";

type Props = {
  alertas: Alerta[];
  turnoActual: number;
  leidas: ReadonlySet<string>;
  onUbicar: (alerta: Alerta) => void;
};

// Alertas agrupadas por turno, de la más nueva a la más vieja ("ESTE TURNO · 23 · 21:53", "TURNO 22 · 21:52"). Cada una
// lleva el ícono y el nombre de quien la reporta (ver VOZ_ALERTA). Tocar una la muestra en el mapa y la marca como leída;
// las leídas se atenúan.
export default function TabAlertas({ alertas, turnoActual, leidas, onUbicar }: Props) {
  if (alertas.length === 0) return <p className="py-4 text-center text-sm text-crimson-800">Sin alertas todavía.</p>;

  const turnos = [...new Set(alertas.map((a) => a.turno))].sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      {turnos.map((turno) => (
        <section key={turno}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-crimson-700">
            {turno === turnoActual ? `Este turno · ${turno}` : `Turno ${turno}`} · {horaDelTurno(turno).hora}
          </h3>
          <ul>
            {alertas
              .filter((a) => a.turno === turno)
              .map((a) => {
                const ubicable = Boolean(a.refugioId || a.sobrevivienteId);
                const { Icono, voz, fondo } = VOZ_ALERTA[a.tipo];
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={!ubicable}
                      onClick={() => onUbicar(a)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-2 py-2 text-left enabled:hover:bg-crimson-100",
                        leidas.has(a.id) && "opacity-60",
                      )}
                    >
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center", fondo)} aria-hidden>
                        <Icono className="size-4 text-crimson-100" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-pixel text-[10px] uppercase text-crimson-700">{voz}</span>
                        <span className="block text-sm font-semibold text-calabaza-900">{a.titulo}</span>
                        <span className="block text-xs text-crimson-800">{a.descripcion}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
