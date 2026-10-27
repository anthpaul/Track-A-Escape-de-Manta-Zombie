"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Alerta } from "@/features/mapa/domain/alertas";

type Props = {
  alertas: Alerta[];
  leidas: ReadonlySet<string>;
  onUbicar: (alerta: Alerta) => void;
  onMarcarLeida: (id: string) => void;
};

export default function TabAlertas({ alertas, leidas, onUbicar, onMarcarLeida }: Props) {
  if (alertas.length === 0) return <p className="py-4 text-center text-sm text-crimson-800">Sin alertas todavía.</p>;

  return (
    <ul className="space-y-2">
      {alertas.map((a) => {
        const nueva = !leidas.has(a.id);
        return (
          <li key={a.id} className={cn("rounded-lg border bg-crimson-100 p-3", nueva ? "border-crimson-600" : "border-crimson-300")}>
            <div className="flex items-center justify-between">
              <span className="font-pixel text-[10px] text-crimson-800">T{a.turno}</span>
              {nueva && <span className="font-pixel text-[10px] text-sangre-700">NUEVA</span>}
            </div>
            <p className="mt-1 font-semibold text-calabaza-900">{a.titulo}</p>
            <p className="text-sm text-crimson-800">{a.descripcion}</p>
            <div className="mt-2 flex gap-2">
              {(a.refugioId || a.sobrevivienteId) && (
                <Button size="sm" onClick={() => onUbicar(a)} className="font-pixel text-[10px]">
                  UBICAR
                </Button>
              )}
              {nueva && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMarcarLeida(a.id)}
                  className="border-crimson-600 bg-transparent font-pixel text-[10px] text-calabaza-900"
                >
                  MARCAR LEÍDA
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
