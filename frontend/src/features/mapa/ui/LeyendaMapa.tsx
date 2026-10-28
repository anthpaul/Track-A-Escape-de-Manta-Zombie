"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COLOR_CALLE, COLOR_RUTA, COLOR_SOBREVIVIENTE, COLOR_ZOMBIE, COLOR_ZONA_HORDA } from "@/features/mapa/simbologia/colores";
import { ICONO_REFUGIO } from "@/features/mapa/simbologia/iconos";

// Same colors the map draws (simbologia/), so the legend can never drift from the layers.
const Punto = ({ color }: { color: string }) => (
  <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
);
const Anillo = ({ color }: { color: string }) => (
  <span className="size-3 shrink-0 rounded-full border-2" style={{ borderColor: color }} aria-hidden />
);
const Linea = ({ color, estilo = "solid" }: { color: string; estilo?: "solid" | "dashed" }) => (
  <span className="h-0 w-4 shrink-0 border-t-2" style={{ borderColor: color, borderTopStyle: estilo }} aria-hidden />
);
const Refugio = ({ borde }: { borde: string }) => (
  <span
    className="flex size-3.5 shrink-0 items-center justify-center rounded-sm border-2"
    style={{ background: ICONO_REFUGIO.color, borderColor: borde }}
    aria-hidden
  >
    <ICONO_REFUGIO.Icono className="size-2" style={{ color: ICONO_REFUGIO.borde }} />
  </span>
);

type Item = { nombre: string; simbolo: ReactNode };
const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Personas",
    items: [
      { nombre: "Sobreviviente", simbolo: <Punto color={COLOR_SOBREVIVIENTE.en_ruta} /> },
      { nombre: "Mordido", simbolo: <Punto color={COLOR_SOBREVIVIENTE.mordido} /> },
    ],
  },
  {
    titulo: "Peligro",
    items: [
      { nombre: "Zombie", simbolo: <Punto color={COLOR_ZOMBIE.caminante} /> },
      { nombre: "Horda (zona peligrosa)", simbolo: <Anillo color={COLOR_ZONA_HORDA.borde} /> },
    ],
  },
  {
    titulo: "Lugares y calles",
    items: [
      { nombre: "Refugio", simbolo: <Refugio borde={ICONO_REFUGIO.borde} /> },
      { nombre: "Refugio sin acceso", simbolo: <Refugio borde={COLOR_CALLE.bloqueada} /> },
      { nombre: "Calle cerrada", simbolo: <Linea color={COLOR_CALLE.bloqueada} /> },
      { nombre: "Puente dañado", simbolo: <Linea color={COLOR_CALLE.danado} estilo="dashed" /> },
      { nombre: "Ruta elegida", simbolo: <Linea color={COLOR_RUTA} estilo="dashed" /> },
    ],
  },
];

// The three dots on the pill are the three things to tell apart first: people, bitten, zombies.
const PUNTOS_PILDORA = [COLOR_SOBREVIVIENTE.en_ruta, COLOR_SOBREVIVIENTE.mordido, COLOR_ZOMBIE.caminante];

// Map legend: closed by default behind a pill, and it closes by itself as soon as the map is touched,
// so it never covers what the operator is looking at.
export default function LeyendaMapa() {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const alTocarFuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("pointerdown", alTocarFuera);
    return () => document.removeEventListener("pointerdown", alTocarFuera);
  }, [abierta]);

  return (
    <aside
      ref={caja}
      aria-label="Leyenda del mapa"
      // Above the OSM/CARTO attribution, which must stay visible.
      className="absolute bottom-8 right-3 z-10 flex w-64 flex-col items-end gap-2 text-xs text-calabaza-900"
    >
      {abierta && (
        <div id="leyenda-contenido" className="w-full space-y-3 rounded-lg border border-crimson-600 bg-crimson-100/95 p-3 backdrop-blur">
          {GRUPOS.map(({ titulo, items }) => (
            <section key={titulo}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-crimson-700">{titulo}</h3>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {items.map(({ nombre, simbolo }) => (
                  <li key={nombre} className="flex items-center gap-2">
                    {simbolo}
                    {nombre}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        aria-controls="leyenda-contenido"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border bg-crimson-100/95 px-3 py-1.5 font-semibold backdrop-blur",
          abierta ? "border-calabaza-900" : "border-crimson-600 hover:border-calabaza-500",
        )}
      >
        <span className="inline-flex gap-0.5" aria-hidden>
          {PUNTOS_PILDORA.map((color) => (
            <span key={color} className="size-1.5 rounded-full" style={{ background: color }} />
          ))}
        </span>
        {abierta ? "Cerrar leyenda" : "Leyenda"}
      </button>
    </aside>
  );
}
