import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilaRefugio = { id: string; nombre: string; ocupacion: number | null; capacidad: number };

// Ocupación en vivo de los cuatro refugios reales ("21/50 a salvo", igual que la etiqueta del mapa); sin una ronda en
// curso, solo su capacidad.
export default function RefugiosInicio({ filas }: { filas: FilaRefugio[] }) {
  return (
    <ul className="divide-y divide-crimson-300 border-y border-crimson-300">
      {filas.map((r) => {
        const pct = r.ocupacion === null ? 0 : Math.min(100, Math.floor((r.ocupacion * 100) / r.capacidad));
        const lleno = r.ocupacion !== null && r.ocupacion >= r.capacidad;
        return (
          <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[14rem_1fr_7rem]">
            <span className="inline-flex items-center gap-2 font-semibold text-calabaza-900">
              <ShieldCheck className="size-4 text-marea-900" aria-hidden />
              {r.nombre}
            </span>
            <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-crimson-300 sm:col-span-1 sm:row-start-auto">
              <span className={cn("block h-full rounded-full", lleno ? "bg-sangre-700" : "bg-marea-700")} style={{ width: `${pct}%` }} />
            </span>
            <span className={cn("text-right font-pixel text-xs", lleno ? "text-sangre-700" : "text-calabaza-500")}>
              {r.ocupacion === null ? `${r.capacidad} cupos` : `${r.ocupacion}/${r.capacidad} ${lleno ? "LLENO" : "a salvo"}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
