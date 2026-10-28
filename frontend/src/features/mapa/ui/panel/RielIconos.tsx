"use client";

import { useState } from "react";
import { CircleHelp, Layers, PanelLeftClose, PanelLeftOpen, ShieldCheck, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tab } from "@/features/mapa/domain/panel";
import AyudaMapa from "./AyudaMapa";

type Props = { tab: Tab; abierto: boolean; noLeidas: number; onElegir: (tab: Tab) => void; onAlternarPanel: () => void };

// Cada ícono dice de qué trata la sección, con el color que esa cosa tiene en el mapa.
const BOTONES: { tab: Tab; etiqueta: string; nombre: string; Icono: LucideIcon; clase: string }[] = [
  { tab: "ref", etiqueta: "Refugios", nombre: "Refugios", Icono: ShieldCheck, clase: "text-marea-900" },
  { tab: "surv", etiqueta: "Personas", nombre: "Sobrevivientes", Icono: Users, clase: "text-marea-700" },
  { tab: "layers", etiqueta: "Capas", nombre: "Capas del mapa", Icono: Layers, clase: "text-calabaza-500" },
  { tab: "alert", etiqueta: "Alertas", nombre: "Alertas", Icono: TriangleAlert, clase: "text-sangre-700" },
];

// Riel de íconos: columna izquierda en escritorio, barra inferior en teléfonos.
export default function RielIconos({ tab, abierto, noLeidas, onElegir, onAlternarPanel }: Props) {
  const [ayuda, setAyuda] = useState(false);
  return (
    <>
    <nav
      aria-label="Secciones del panel"
      // Los tamaños replican map/padding.ts (DISENO). Teléfono en vertical: barra inferior encima del indicador de inicio de iOS.
      className="absolute inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-crimson-300 bg-crimson-100 pb-[env(safe-area-inset-bottom)] max-md:landscape:inset-x-auto max-md:landscape:inset-y-0 max-md:landscape:left-0 max-md:landscape:h-auto max-md:landscape:w-14 max-md:landscape:flex-col max-md:landscape:justify-center max-md:landscape:gap-1 max-md:landscape:border-r max-md:landscape:border-t-0 max-md:landscape:pb-0 max-md:landscape:pl-[env(safe-area-inset-left)] md:inset-x-auto md:inset-y-0 md:left-0 md:h-auto md:w-16 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:py-3 md:pb-3"
    >
      <span
        className="hidden font-pixel text-xl text-calabaza-500 [text-shadow:2px_2px_0_#9a031e] md:mb-2 md:block"
        title="Spondylus Z"
        aria-hidden
      >
        SZ
      </span>
      {/* Muestra u oculta el panel lateral (hoja inferior en teléfonos); el mapa se queda. */}
      <button
        type="button"
        onClick={onAlternarPanel}
        aria-label={abierto ? "Ocultar panel" : "Mostrar panel"}
        aria-expanded={abierto}
        aria-controls="panel-mapa"
        className="flex size-13 flex-col items-center justify-center gap-1 rounded-lg text-calabaza-500 transition-colors hover:bg-crimson-300 max-md:landscape:size-11 md:mb-1"
      >
        {abierto ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
        <span className="text-[10px] font-semibold text-calabaza-900">{abierto ? "Ocultar" : "Panel"}</span>
      </button>
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
              "relative flex size-13 flex-col items-center justify-center gap-1 rounded-lg transition-colors max-md:landscape:size-11",
              activo ? "bg-crimson-500" : "hover:bg-crimson-300",
            )}
          >
            <Icono className={cn("size-5", clase)} aria-hidden />
            <span className="text-[10px] font-semibold text-calabaza-900">{etiqueta}</span>
            {t === "alert" && noLeidas > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4.5 items-center justify-center rounded-full bg-sangre-600 font-pixel text-[9px] text-white">
                {noLeidas > 9 ? "9+" : noLeidas}
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setAyuda(true)}
        aria-label="Cómo funciona"
        className="flex size-13 flex-col items-center justify-center gap-1 rounded-lg text-calabaza-900 transition-colors hover:bg-crimson-300 max-md:landscape:size-11 md:mt-auto"
      >
        <CircleHelp className="size-5" aria-hidden />
        <span className="text-[10px] font-semibold">Ayuda</span>
      </button>
    </nav>
    <AyudaMapa abierta={ayuda} onCambiar={setAyuda} />
    </>
  );
}
