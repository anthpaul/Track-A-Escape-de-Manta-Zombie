"use client";

import { Circle, Diamond, Square, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tab } from "@/features/mapa/domain/panel";

type Props = { tab: Tab; abierto: boolean; noLeidas: number; onElegir: (tab: Tab) => void };

const BOTONES: { tab: Tab; etiqueta: string; nombre: string; Icono: LucideIcon; clase: string }[] = [
  { tab: "ref", etiqueta: "REF", nombre: "Refugios", Icono: Square, clase: "fill-marea-900 text-marea-500" },
  { tab: "surv", etiqueta: "SOB", nombre: "Sobrevivientes", Icono: Circle, clase: "fill-marea-700 text-marea-700" },
  { tab: "layers", etiqueta: "CAPAS", nombre: "Capas", Icono: Circle, clase: "fill-calabaza-500 text-calabaza-500" },
  { tab: "alert", etiqueta: "ALER", nombre: "Alertas", Icono: Diamond, clase: "fill-sangre-700 text-sangre-700" },
];

// Icon rail: left column on desktop, bottom bar on phones.
export default function RielIconos({ tab, abierto, noLeidas, onElegir }: Props) {
  return (
    <nav
      aria-label="Secciones del panel"
      className="absolute inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-crimson-300 bg-crimson-100 md:inset-x-auto md:inset-y-0 md:left-0 md:h-auto md:w-16 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:py-3"
    >
      <span className="hidden font-pixel text-xl text-calabaza-500 [text-shadow:2px_2px_0_#9a031e] md:mb-2 md:block" aria-hidden>
        EM
      </span>
      {BOTONES.map(({ tab: t, etiqueta, nombre, Icono, clase }) => {
        const activo = abierto && tab === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onElegir(t)}
            aria-label={nombre}
            aria-pressed={activo}
            className={cn(
              "relative flex size-13 flex-col items-center justify-center gap-1 rounded-lg transition-colors",
              activo ? "bg-crimson-500" : "hover:bg-crimson-300",
            )}
          >
            <Icono className={cn("size-4", clase)} aria-hidden />
            <span className="font-pixel text-[8px] text-calabaza-900">{etiqueta}</span>
            {t === "alert" && noLeidas > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4.5 items-center justify-center rounded-full bg-sangre-600 font-pixel text-[9px] text-white">
                {noLeidas > 9 ? "9+" : noLeidas}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
