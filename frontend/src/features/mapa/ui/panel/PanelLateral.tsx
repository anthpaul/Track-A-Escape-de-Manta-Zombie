"use client";

import { Activity, FlaskConical, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NivelLatencia, ResumenPanel } from "@/features/mapa/domain/resumen";
import type { Conexion } from "@/features/mapa/domain/tipos";
import IndicadorEnVivo from "./IndicadorEnVivo";

type Props = {
  titulo: string;
  resumen: ResumenPanel;
  generadoEn: string;
  conexion: Conexion;
  children: React.ReactNode;
};

const CIFRAS: { clave: "aSalvo" | "enRuta" | "mordidos"; etiqueta: string; numero: string; texto: string }[] = [
  { clave: "aSalvo", etiqueta: "a salvo", numero: "text-marea-800", texto: "text-marea-700" },
  { clave: "enRuta", etiqueta: "en camino", numero: "text-calabaza-900", texto: "text-calabaza-500" },
  { clave: "mordidos", etiqueta: "mordidos", numero: "text-crimson-700", texto: "text-crimson-700" },
];

const CLASE_LATENCIA: Record<NivelLatencia, string> = {
  excelente: "text-marea-700",
  bueno: "text-calabaza-500",
  limite: "text-otono-500",
  fuera: "text-sangre-700",
  sin_datos: "text-crimson-800",
};

// Side panel: round and turn, the live indicator, the three numbers (safe, on the way, bitten) and the
// p95 the challenge cares about, always visible whatever the tab, then the tab title. Bottom sheet on phones.
// Why the panel is not showing the live game: the operator must never mistake the simulation for it.
const AVISO: Record<Exclude<Conexion, "en_vivo">, { texto: string; detalle: string; Icono: LucideIcon; clase: string }> = {
  simulado: { texto: "Simulación local", detalle: "Datos de prueba generados en este navegador, sin el servidor", Icono: FlaskConical, clase: "bg-crimson-500 text-calabaza-900" },
  conectando: { texto: "Conectando…", detalle: "Esperando el primer turno del servidor; mientras tanto, una simulación local", Icono: RefreshCw, clase: "bg-crimson-500 text-calabaza-900" },
  reconectando: { texto: "Reconectando", detalle: "No llegó el último turno: se muestra el anterior real", Icono: RefreshCw, clase: "bg-otono-500 text-crimson-100" },
  sin_partida: { texto: "Esperando la próxima ronda", detalle: "No hay una ronda en curso ahora: se muestra una simulación local", Icono: FlaskConical, clase: "bg-crimson-500 text-calabaza-900" },
  sin_conexion: { texto: "Sin conexión · simulación local", detalle: "El servidor no responde: se muestra una simulación local", Icono: WifiOff, clase: "bg-sangre-700 text-crimson-100" },
};

export default function PanelLateral({ titulo, resumen, generadoEn, conexion, children }: Props) {
  const aviso = conexion === "en_vivo" ? null : AVISO[conexion];
  return (
    <section
      id="panel-mapa"
      aria-label={titulo}
      // Sizes mirror map/padding.ts (DISENO).
      className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex max-h-[50dvh] flex-col gap-3.5 rounded-t-2xl border-t border-crimson-300 bg-crimson-200/95 p-5 backdrop-blur max-md:landscape:inset-y-0 max-md:landscape:bottom-0 max-md:landscape:left-14 max-md:landscape:right-auto max-md:landscape:max-h-none max-md:landscape:w-72 max-md:landscape:gap-2.5 max-md:landscape:rounded-none max-md:landscape:border-r max-md:landscape:border-t-0 max-md:landscape:p-3 md:inset-y-0 md:bottom-0 md:left-16 md:right-auto md:max-h-none md:w-[300px] md:rounded-none md:border-r md:border-t-0 xl:w-[340px]"
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-crimson-700">
            Ronda {resumen.ronda} · Turno {resumen.turno}
          </span>
          {/* Only real snapshots get "EN VIVO": simulated turns are always fresh, so their age proves nothing. */}
          {(conexion === "en_vivo" || conexion === "reconectando") && <IndicadorEnVivo generadoEn={generadoEn} />}
          {aviso && (
            <span title={aviso.detalle} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold", aviso.clase)}>
              <aviso.Icono className="size-3" aria-hidden />
              {aviso.texto}
            </span>
          )}
        </div>
        {/* The three numbers that tell how the round is going, always visible whatever the tab. */}
        <dl className="grid grid-cols-3 gap-2">
          {CIFRAS.map(({ clave, etiqueta, numero, texto }) => (
            <div key={clave} className="flex flex-col-reverse">
              <dt className={cn("text-xs", texto)}>{etiqueta}</dt>
              <dd className={cn("font-pixel text-2xl leading-none", numero)}>{resumen[clave]}</dd>
            </div>
          ))}
        </dl>
        {/* Demo rounds call the engine in-process, so there is no response time to show: hide it instead of "—". */}
        {resumen.p95ms !== null && (
          <p
            className={cn("inline-flex items-center gap-1 text-xs", CLASE_LATENCIA[resumen.latencia.nivel])}
            // p95 in plain words: the time within which 95 % of the engine's answers arrive.
            title="El 95 % de las respuestas del motor llega en este tiempo o menos. Se mide en las rondas de evaluación."
          >
            <Activity className="size-3.5" aria-hidden />
            Respuesta {Math.round(resumen.p95ms)} ms
          </p>
        )}
        <h2 className="pt-1 font-pixel text-base uppercase text-calabaza-500">{titulo}</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:var(--color-crimson-600)_transparent] [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}
