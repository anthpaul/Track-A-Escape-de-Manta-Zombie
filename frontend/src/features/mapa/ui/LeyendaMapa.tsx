"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Map as MapaIcono, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_CALLE, COLOR_RUTA, COLOR_SOBREVIVIENTE } from "@/features/mapa/simbologia/colores";
import { ICONO_REFUGIO, ICONOS_ZOMBIE } from "@/features/mapa/simbologia/iconos";

// Same icons and colors the map draws (simbologia/), so the legend can never drift from the layers.
const ZOMBIES: { nombre: string; Icono: LucideIcon; color: string }[] = [
  { nombre: "Caminante", ...ICONOS_ZOMBIE.caminante },
  { nombre: "Corredor (persigue)", ...ICONOS_ZOMBIE.corredor },
  { nombre: "Horda (bloquea la zona)", ...ICONOS_ZOMBIE.horda },
];

const LINEAS: { nombre: string; color: string; punteada?: boolean }[] = [
  { nombre: "Ruta planificada", color: COLOR_RUTA, punteada: true },
  { nombre: "Avenida", color: COLOR_CALLE.avenida },
  { nombre: "Calle", color: COLOR_CALLE.calle },
  { nombre: "Puente", color: COLOR_CALLE.puente },
  { nombre: "Calle bloqueada", color: COLOR_CALLE.bloqueada },
];

// Map legend: open on wide screens, a small button on phones so it never hides the map.
export default function LeyendaMapa() {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => setAbierta(window.matchMedia("(min-width: 768px)").matches), []);

  return (
    <aside
      aria-label="Leyenda del mapa"
      // Above the OSM/CARTO attribution, which must stay visible.
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
          {LINEAS.map(({ nombre, color, punteada }) => (
            <li key={nombre} className="flex items-center gap-2">
              <span
                className="h-0 w-4 border-t-2"
                style={{ borderColor: color, borderTopStyle: punteada ? "dashed" : "solid" }}
                aria-hidden
              />
              {nombre}
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
