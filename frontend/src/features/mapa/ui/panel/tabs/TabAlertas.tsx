"use client";

import { cn } from "@/lib/utils";
import type { Alerta, TipoAlerta } from "@/features/mapa/domain/alertas";

type Props = {
  alertas: Alerta[];
  turnoActual: number;
  leidas: ReadonlySet<string>;
  onUbicar: (alerta: Alerta) => void;
};

// Same dot colors as the turn bar: pink bites, red danger, pumpkin warnings, tide arrivals.
const COLOR_TIPO: Record<TipoAlerta, string> = {
  mordido: "bg-crimson-700",
  horda: "bg-sangre-700",
  calle_bloqueada: "bg-sangre-700",
  refugio_lleno: "bg-calabaza-500",
  llegada: "bg-marea-700",
};

// Alerts grouped by turn, newest first ("ESTE TURNO · 23", "TURNO 22"). Tapping one shows it on the
// map and marks it read; read ones fade.
export default function TabAlertas({ alertas, turnoActual, leidas, onUbicar }: Props) {
  if (alertas.length === 0) return <p className="py-4 text-center text-sm text-crimson-800">Sin alertas todavía.</p>;

  const turnos = [...new Set(alertas.map((a) => a.turno))].sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      {turnos.map((turno) => (
        <section key={turno}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-crimson-700">
            {turno === turnoActual ? `Este turno · ${turno}` : `Turno ${turno}`}
          </h3>
          <ul>
            {alertas
              .filter((a) => a.turno === turno)
              .map((a) => {
                const ubicable = Boolean(a.refugioId || a.sobrevivienteId);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={!ubicable}
                      onClick={() => onUbicar(a)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left enabled:hover:bg-crimson-100",
                        leidas.has(a.id) && "opacity-60",
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", COLOR_TIPO[a.tipo])} aria-hidden />
                      <span className="min-w-0">
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
