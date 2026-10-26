"use client";

import { Activity, Ban, Footprints, HeartCrack, HeartPulse, ShieldCheck, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NivelLatencia, ResumenPanel } from "@/features/mapa/domain/resumen";
import { COLOR_REFUGIO, COLOR_SOBREVIVIENTE } from "@/features/mapa/map/layers/estilos";

const ESTILO_LATENCIA: Record<NivelLatencia, { clase: string; texto: string }> = {
  excelente: { clase: "text-green-400", texto: "excelente" },
  bueno: { clase: "text-yellow-300", texto: "bueno" },
  limite: { clase: "text-orange-400", texto: "al límite" },
  fuera: { clase: "text-red-400", texto: "fuera de tiempo" },
  sin_datos: { clase: "text-muted-foreground", texto: "sin datos" },
};

function Dato({ Icono, etiqueta, valor, color }: { Icono: LucideIcon; etiqueta: string; valor: number; color: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icono className="size-3.5" style={{ color }} aria-hidden />
        {etiqueta}
      </div>
      <div className="text-xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function Fila({ Icono, etiqueta, children }: { Icono: LucideIcon; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icono className="size-3.5" aria-hidden />
        {etiqueta}
      </dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

// Presentational stats panel: everything comes from the resumen, nothing is computed here.
export default function PanelMetricas({ resumen }: { resumen: ResumenPanel }) {
  const latencia = ESTILO_LATENCIA[resumen.latencia.nivel];

  return (
    <Card
      size="sm"
      aria-label="Estado de la ronda"
      className="absolute left-3 right-3 top-12 bg-card/85 backdrop-blur sm:left-auto sm:top-3 sm:w-72"
    >
      <CardHeader className="flex items-baseline justify-between">
        <CardTitle className="text-xl text-primary">Ronda {resumen.ronda}</CardTitle>
        <span className="tabular-nums text-muted-foreground">Turno {resumen.turno}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">
          <Dato Icono={Footprints} etiqueta="En ruta" valor={resumen.enRuta} color={COLOR_SOBREVIVIENTE.en_ruta} />
          <Dato Icono={ShieldCheck} etiqueta="A salvo" valor={resumen.aSalvo} color={COLOR_REFUGIO} />
          <Dato Icono={HeartCrack} etiqueta="Mordidos" valor={resumen.mordidos} color={COLOR_SOBREVIVIENTE.mordido} />
        </div>

        <dl className="space-y-1">
          <Fila Icono={HeartPulse} etiqueta="Supervivencia">{resumen.supervivenciaPct}%</Fila>
          <Fila Icono={Activity} etiqueta="p95 de /paso">
            <span className={latencia.clase}>
              {resumen.p95ms === null ? "—" : `${Math.round(resumen.p95ms)} ms`} · {latencia.texto}
            </span>
          </Fila>
          <Fila Icono={Ban} etiqueta="Calles bloqueadas">
            <span className={cn(resumen.callesBloqueadas > 0 && "text-red-400")}>{resumen.callesBloqueadas}</span>
          </Fila>
        </dl>

        <div>
          <h3 className="mb-1 font-heading text-sm text-primary">Refugios</h3>
          <ul className="space-y-1.5">
            {resumen.refugios.map((r) => (
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
                      backgroundColor: r.lleno ? "#f87171" : COLOR_REFUGIO,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
