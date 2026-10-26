"use client";

import { FlaskConical, PanelRightClose, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumenPanel } from "@/features/mapa/domain/resumen";
import type { Grafo, Sobreviviente } from "@/features/mapa/domain/tipos";
import SeccionLeyenda from "./SeccionLeyenda";
import SeccionRefugios from "./SeccionRefugios";
import SeccionRonda from "./SeccionRonda";
import SeccionSobreviviente from "./SeccionSobreviviente";

type Props = {
  grafo: Grafo;
  resumen: ResumenPanel;
  seguido: Sobreviviente | null;
  ruta: string[];
  elegidoAMano: boolean;
  esPrueba: boolean;
  onCerrar: () => void;
};

// Side panel with all round information. Presentational: everything arrives already computed.
export default function Sidebar({ grafo, resumen, seguido, ruta, elegidoAMano, esPrueba, onCerrar }: Props) {
  return (
    <aside
      aria-label="Información de la ronda"
      className="flex min-h-0 w-full flex-col border-t border-border bg-background md:h-full md:w-[22rem] md:shrink-0 md:border-l md:border-t-0"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-heading text-2xl leading-tight text-primary">
            <Skull className="size-6 shrink-0" aria-hidden />
            Escape de Manta
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Mapa en vivo
            {esPrueba && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground">
                <FlaskConical className="size-3" aria-hidden />
                Datos de prueba
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Ocultar panel" className="hidden md:inline-flex">
          <PanelRightClose aria-hidden />
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <SeccionRonda resumen={resumen} />
        <SeccionSobreviviente grafo={grafo} sobreviviente={seguido} ruta={ruta} elegidoAMano={elegidoAMano} />
        <SeccionRefugios refugios={resumen.refugios} />
        <SeccionLeyenda />
      </div>
    </aside>
  );
}
