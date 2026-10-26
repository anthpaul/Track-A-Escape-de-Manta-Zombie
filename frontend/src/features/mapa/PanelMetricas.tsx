"use client";

import type { NivelLatencia, ResumenPanel } from "./panel";
import { COLOR_REFUGIO, COLOR_SOBREVIVIENTE } from "./capas/estilos";

const ESTILO_LATENCIA: Record<NivelLatencia, { clase: string; texto: string }> = {
  excelente: { clase: "text-green-400", texto: "excelente" },
  bueno: { clase: "text-yellow-300", texto: "bueno" },
  limite: { clase: "text-orange-400", texto: "al límite" },
  fuera: { clase: "text-red-400", texto: "fuera de tiempo" },
  sin_datos: { clase: "text-neutral-400", texto: "sin datos" },
};

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div className="rounded-md bg-white/5 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {etiqueta}
      </div>
      <div className="text-xl font-semibold tabular-nums text-white">{valor}</div>
    </div>
  );
}

// Presentational stats panel: everything comes from the resumen, nothing is computed here.
export default function PanelMetricas({ resumen }: { resumen: ResumenPanel }) {
  const latencia = ESTILO_LATENCIA[resumen.latencia.nivel];

  return (
    <section
      aria-label="Estado de la ronda"
      className="absolute left-3 right-3 top-12 rounded-lg border border-white/10 bg-neutral-950/85 p-3 text-sm text-neutral-200 shadow-lg backdrop-blur sm:left-auto sm:top-3 sm:w-72"
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold text-white">Ronda {resumen.ronda}</h2>
        <span className="tabular-nums text-neutral-400">Turno {resumen.turno}</span>
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        <Dato etiqueta="En ruta" valor={resumen.enRuta} color={COLOR_SOBREVIVIENTE.en_ruta} />
        <Dato etiqueta="A salvo" valor={resumen.aSalvo} color={COLOR_REFUGIO} />
        <Dato etiqueta="Mordidos" valor={resumen.mordidos} color={COLOR_SOBREVIVIENTE.mordido} />
      </div>

      <dl className="mt-2 space-y-1">
        <div className="flex justify-between">
          <dt className="text-neutral-400">Supervivencia</dt>
          <dd className="font-medium tabular-nums">{resumen.supervivenciaPct}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-400">p95 de /paso</dt>
          <dd className={`font-medium tabular-nums ${latencia.clase}`}>
            {resumen.p95ms === null ? "—" : `${Math.round(resumen.p95ms)} ms`} · {latencia.texto}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-400">Calles bloqueadas</dt>
          <dd className={`font-medium tabular-nums ${resumen.callesBloqueadas > 0 ? "text-red-400" : ""}`}>
            {resumen.callesBloqueadas}
          </dd>
        </div>
      </dl>

      <h3 className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-neutral-400">Refugios</h3>
      <ul className="space-y-1.5">
        {resumen.refugios.map((r) => (
          <li key={r.id}>
            <div className="flex justify-between text-xs">
              <span className="truncate">{r.nombre}</span>
              <span className={`tabular-nums ${r.lleno ? "font-semibold text-red-400" : "text-neutral-400"}`}>
                {r.lleno ? "LLENO" : `${r.ocupacion}/${r.capacidad}`}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
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
    </section>
  );
}
