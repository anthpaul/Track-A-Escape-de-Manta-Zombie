"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RefugioVista } from "@/features/mapa/domain/vistas";

type Props = {
  refugios: RefugioVista[];
  refugioId: string | null;
  mostrarRuta: boolean;
  onSeleccionar: (id: string) => void;
  onAlternarRuta: () => void;
  onVerEnCamino: (nombre: string) => void;
};

// Occupancy bar: full → danger red, ≥60% → pumpkin, otherwise tide.
const colorBarra = (pct: number) => (pct >= 100 ? "bg-sangre-700" : pct >= 60 ? "bg-calabaza-500" : "bg-marea-700");

// One plain line per shelter: no access (red), who is on the way and how many of them are in danger.
function estadoRefugio(r: RefugioVista): { texto: string; clase: string } {
  if (r.motivoSinAcceso === "horda") return { texto: "Sin acceso: hay una horda en la entrada", clase: "text-sangre-700" };
  if (r.motivoSinAcceso === "calle") return { texto: "Sin acceso: las calles de entrada están cerradas", clase: "text-sangre-700" };
  if (r.enCamino === 0) return { texto: "Nadie en camino", clase: "text-crimson-800" };
  if (r.enPeligro === 0) return { texto: `${r.enCamino} en camino`, clase: "text-marea-800" };
  return { texto: `${r.enCamino} en camino · ${r.enPeligro} en peligro`, clase: "text-calabaza-500" };
}

export default function TabRefugios(p: Props) {
  return (
    <ul className="divide-y divide-crimson-300">
      {p.refugios.map((r) => {
        const elegido = r.id === p.refugioId;
        const estado = estadoRefugio(r);
        return (
          <li
            key={r.id}
            role="button"
            tabIndex={0}
            aria-pressed={elegido}
            onClick={() => p.onSeleccionar(r.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onSeleccionar(r.id)}
            className={cn(
              // Square corners everywhere in the panel; the selected shelter gets a pumpkin edge on the left.
              "cursor-pointer border-l-2 px-3 py-3 transition-colors",
              elegido ? "border-calabaza-500 bg-crimson-100" : "border-transparent hover:bg-crimson-100/60",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold text-calabaza-900">{r.nombre}</span>
              {r.lleno ? (
                <span className="font-pixel text-xs text-sangre-700">LLENO</span>
              ) : (
                <span className="shrink-0 text-xs">
                  <span className="text-calabaza-900">{r.ocupacion}</span>
                  <span className="text-crimson-800"> / {r.capacidad}</span>
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden bg-crimson-300">
              <div className={cn("h-full", colorBarra(r.pct))} style={{ width: `${r.pct}%` }} />
            </div>
            <p className={cn("mt-1.5 text-xs", estado.clase)}>{estado.texto}</p>
            {elegido && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onAlternarRuta();
                  }}
                  className="rounded-none font-pixel text-[10px]"
                >
                  {p.mostrarRuta ? "OCULTAR RUTA" : "VER RUTA"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onVerEnCamino(r.nombre);
                  }}
                  className="rounded-none border-crimson-600 bg-transparent font-pixel text-[10px] text-calabaza-900"
                >
                  EN CAMINO ({r.enCamino})
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
