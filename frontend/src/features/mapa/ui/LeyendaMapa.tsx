"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Map as MapaIcono, TriangleAlert, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_CALLE, COLOR_RUTA, COLOR_SOBREVIVIENTE } from "@/features/mapa/simbologia/colores";
import { ICONO_REFUGIO, ICONO_VEHICULO, ICONOS_ZOMBIE } from "@/features/mapa/simbologia/iconos";

// Los mismos íconos y colores que dibuja el mapa (simbologia/), así la leyenda nunca se desfasa de las capas.
const ZOMBIES: { nombre: string; Icono: LucideIcon; color: string }[] = [
  { nombre: "Caminante", ...ICONOS_ZOMBIE.caminante },
  { nombre: "Corredor (persigue)", ...ICONOS_ZOMBIE.corredor },
  { nombre: "Horda (bloquea la zona)", ...ICONOS_ZOMBIE.horda },
];

// Los puentes son una línea doble en el mapa; las calles cerradas y los puentes dañados llevan la misma señal
// de tránsito que el mapa dibuja sobre ellos (disco de prohibido el paso, triángulo de peligro).
type Linea = { nombre: string; color: string; punteada?: boolean; doble?: boolean; senal?: "prohibido" | "peligro" };
const LINEAS: Linea[] = [
  { nombre: "Ruta planificada", color: COLOR_RUTA, punteada: true },
  { nombre: "Avenida", color: COLOR_CALLE.avenida },
  { nombre: "Calle", color: COLOR_CALLE.calle },
  { nombre: "Puente", color: COLOR_CALLE.puente, doble: true },
  { nombre: "Calle bloqueada", color: COLOR_CALLE.bloqueada, senal: "prohibido" },
  { nombre: "Puente dañado", color: COLOR_CALLE.danado, doble: true, punteada: true, senal: "peligro" },
];

function SimboloLinea({ color, punteada, doble, senal }: Linea) {
  const estilo = punteada ? "dashed" : "solid";
  return (
    <span className="relative flex h-3 w-5 shrink-0 items-center" aria-hidden>
      <span
        className={cn("w-full", doble ? "h-1.5 border-y-2" : "h-0 border-t-2")}
        style={{ borderColor: color, borderTopStyle: estilo, borderBottomStyle: estilo }}
      />
      {senal === "prohibido" && (
        <span className="absolute left-1/2 flex size-2.5 -translate-x-1/2 items-center justify-center rounded-full" style={{ background: color }}>
          <span className="h-0.5 w-1.5 bg-white" />
        </span>
      )}
      {senal === "peligro" && (
        <TriangleAlert className="absolute left-1/2 size-3 -translate-x-1/2" style={{ fill: color, color: "#13030d" }} />
      )}
    </span>
  );
}

// Leyenda del mapa: abierta en pantallas anchas y un botón pequeño en teléfonos, para que nunca tape el mapa.
export default function LeyendaMapa() {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => setAbierta(window.matchMedia("(min-width: 768px)").matches), []);

  return (
    <aside
      aria-label="Leyenda del mapa"
      // Encima de la atribución de OSM/CARTO, que debe seguir visible.
      className="absolute bottom-8 right-3 z-10 w-56 rounded-lg border border-crimson-300 bg-crimson-100/90 text-xs text-calabaza-900 backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 font-semibold"
      >
        <span className="inline-flex items-center gap-1.5">
          <MapaIcono className="size-3.5 text-calabaza-500" aria-hidden />
          Leyenda
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", abierta && "rotate-180")} aria-hidden />
      </button>
      {abierta && (
        <ul className="space-y-1.5 px-3 pb-3">
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: COLOR_SOBREVIVIENTE.en_ruta }} aria-hidden />
            Sobreviviente en camino
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: COLOR_SOBREVIVIENTE.mordido }} aria-hidden />
            Sobreviviente mordido
          </li>
          {ZOMBIES.map(({ nombre, Icono, color }) => (
            <li key={nombre} className="flex items-center gap-2">
              <span className="flex size-4 items-center justify-center rounded-full" style={{ background: color }} aria-hidden>
                <Icono className="size-2.5 text-white" />
              </span>
              {nombre}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span
              className="flex size-4 items-center justify-center rounded-sm border"
              style={{ background: ICONO_REFUGIO.color, borderColor: ICONO_REFUGIO.borde }}
              aria-hidden
            >
              <ICONO_REFUGIO.Icono className="size-2.5" style={{ color: ICONO_REFUGIO.borde }} />
            </span>
            Refugio
          </li>
          <li className="flex items-center gap-2">
            <span className="size-4 rounded-full border-2" style={{ borderColor: COLOR_CALLE.bloqueada }} aria-hidden />
            Refugio sin acceso
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-4 items-center justify-center rounded-full" style={{ background: ICONO_VEHICULO.color }} aria-hidden>
              <ICONO_VEHICULO.Icono className="size-2.5" style={{ color: ICONO_VEHICULO.borde }} />
            </span>
            Camioneta de rescate (hasta 4)
          </li>
          {LINEAS.map((linea) => (
            <li key={linea.nombre} className="flex items-center gap-2">
              <SimboloLinea {...linea} />
              {linea.nombre}
            </li>
          ))}
          <li className="flex items-center gap-2 pt-1 text-crimson-800">
            <UserRound className="size-3" aria-hidden />
            Toca un sobreviviente para seguir su ruta
          </li>
        </ul>
      )}
    </aside>
  );
}
