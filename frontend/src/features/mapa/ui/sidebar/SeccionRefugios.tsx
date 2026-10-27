"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RefugioPanel } from "@/features/mapa/domain/resumen";
import { COLOR_REFUGIO } from "@/features/mapa/simbologia/colores";

// Shelter occupancy with a "full" flag. Presentational only.
export default function SeccionRefugios({ refugios }: { refugios: RefugioPanel[] }) {
  return (
    <Card size="sm" aria-label="Refugios">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base text-primary">
          <ShieldCheck className="size-4" aria-hidden />
          Refugios
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {refugios.map((r) => (
            <li key={r.id}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{r.nombre}</span>
                <span className={cn("tabular-nums", r.lleno ? "font-bold text-red-400" : "text-muted-foreground")}>
                  {r.lleno ? "LLENO" : `${r.ocupacion}/${r.capacidad}`}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (r.ocupacion / Math.max(1, r.capacidad)) * 100)}%`,
                    backgroundColor: r.lleno ? "#f87171" : COLOR_REFUGIO.relleno,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
