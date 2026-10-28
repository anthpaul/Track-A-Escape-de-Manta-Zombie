"use client";

import { Eye } from "lucide-react";
import { etiquetaPersona } from "@/features/mapa/domain/lugares";
import type { EstadoSobreviviente } from "@/features/mapa/domain/tipos";

type Props = {
  sobrevivienteId: string;
  estado: EstadoSobreviviente;
  automatico: boolean;
  refugio: string | null;
  calles: number | null;
  onVer: () => void;
};

// Avisa a quién sigue el mapa (el del anillo y la ruta punteada), para que el seguimiento se note sin buscarlo. Si nadie
// fue elegido, el mapa sigue a alguien solo y lo dice; tocar el aviso abre su ficha.
export default function IndicadorSeguimiento({ sobrevivienteId, estado, automatico, refugio, calles, onVer }: Props) {
  const destino = estado === "en_ruta" && refugio ? ` hacia ${refugio}${calles !== null && calles > 0 ? ` · ${calles} calles` : ""}` : "";
  return (
    <button
      type="button"
      onClick={onVer}
      className="flex max-w-full items-center gap-2 border border-marea-700 bg-crimson-100/95 py-1.5 pl-2 pr-3 text-sm text-calabaza-900 shadow-xl backdrop-blur hover:bg-crimson-200"
    >
      <span className="flex size-6 shrink-0 items-center justify-center bg-marea-700" aria-hidden>
        <Eye className="size-3.5 text-crimson-100" />
      </span>
      <span className="shrink-0 font-pixel text-[10px] uppercase text-marea-900">{automatico ? "Siguiendo (auto)" : "Siguiendo"}</span>
      <span className="min-w-0 truncate font-semibold">
        {etiquetaPersona(sobrevivienteId, estado)}
        {destino}
      </span>
    </button>
  );
}
