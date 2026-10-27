"use client";

import { Diamond, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Alerta } from "@/features/mapa/domain/alertas";

type Props = { alerta: Alerta | null; onVerAlertas: () => void; onCerrar: () => void };

// Latest alert over the map. Stays closed after × until a new alert arrives (reducer rule).
export default function ToastAlerta({ alerta, onVerAlertas, onCerrar }: Props) {
  if (!alerta) return null;
  return (
    <div
      role="status"
      className="absolute left-3 right-3 top-3 z-20 rounded-lg border border-sangre-700 bg-sangre-500 p-3 shadow-xl md:left-auto md:right-5 md:top-5 md:w-80"
    >
      <div className="flex items-start gap-2">
        <Diamond className="mt-0.5 size-4 shrink-0 fill-calabaza-500 text-calabaza-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-sm uppercase text-calabaza-900">{alerta.titulo}</p>
          <p className="mt-1 text-sm text-sangre-900">{alerta.descripcion}</p>
          <Button size="sm" onClick={onVerAlertas} className="mt-2 bg-calabaza-900 font-pixel text-[10px] text-sangre-500 hover:bg-calabaza-800">
            VER ALERTAS
          </Button>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar alerta" className="text-calabaza-900/80 hover:text-calabaza-900">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
