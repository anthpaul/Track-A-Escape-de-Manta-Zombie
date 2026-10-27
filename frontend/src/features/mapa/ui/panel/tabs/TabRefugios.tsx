"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RefugioVista } from "@/features/mapa/domain/vistas";

type Props = {
  aSalvo: number;
  capacidadLibre: number;
  refugios: RefugioVista[];
  refugioId: string | null;
  mostrarRuta: boolean;
  onSeleccionar: (id: string) => void;
  onAlternarRuta: () => void;
  onVerEnCamino: (nombre: string) => void;
};

// Occupancy bar: full → danger red, ≥60% → pumpkin, otherwise tide.
const colorBarra = (pct: number) => (pct >= 100 ? "bg-sangre-700" : pct >= 60 ? "bg-calabaza-500" : "bg-marea-700");

export default function TabRefugios(p: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-crimson-100 p-3">
          <p className="text-xs text-crimson-800">A salvo</p>
          <p className="font-pixel text-2xl text-marea-800">{p.aSalvo}</p>
        </div>
        <div className="rounded-lg bg-crimson-100 p-3">
          <p className="text-xs text-crimson-800">Capacidad libre</p>
          <p className="font-pixel text-2xl text-calabaza-500">{p.capacidadLibre}</p>
        </div>
      </div>

      {p.refugios.map((r) => {
        const elegido = r.id === p.refugioId;
        return (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            aria-pressed={elegido}
            onClick={() => p.onSeleccionar(r.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onSeleccionar(r.id)}
            className={cn(
              "cursor-pointer rounded-lg border bg-crimson-100 p-3 transition-colors",
              elegido ? "border-calabaza-500" : "border-transparent hover:border-crimson-400",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-calabaza-900">{r.nombre}</span>
              <span className={cn("font-pixel text-xs", r.lleno ? "text-sangre-700" : "text-calabaza-500")}>
                {r.lleno ? "LLENO" : `${r.pct}%`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-crimson-300">
              <div className={cn("h-full rounded-full", colorBarra(r.pct))} style={{ width: `${r.pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-crimson-800">
              {r.ocupacion} / {r.capacidad} ·{" "}
              {r.sinAcceso ? (
                <span className="font-semibold text-sangre-700">sin acceso: el camino está bloqueado</span>
              ) : r.accesosBloqueados > 0 ? (
                `${r.accesosBloqueados} calles de acceso bloqueadas`
              ) : (
                "acceso libre"
              )}
            </p>
            {elegido && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onAlternarRuta();
                  }}
                  className="font-pixel text-[10px]"
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
                  className="border-crimson-600 bg-transparent font-pixel text-[10px] text-calabaza-900"
                >
                  EN CAMINO ({r.enCamino})
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
