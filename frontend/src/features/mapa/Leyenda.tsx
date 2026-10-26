"use client";

import { COLOR_CALLE, COLOR_REFUGIO, COLOR_SOBREVIVIENTE, COLOR_ZONA_HORDA } from "./capas/estilos";
import { ICONOS_ZOMBIE } from "./capas/iconos";

const ZOMBIES = [
  { tipo: "caminante", texto: "Caminante" },
  { tipo: "corredor", texto: "Corredor" },
  { tipo: "horda", texto: "Horda" },
] as const;

const CALLES = [
  { color: COLOR_CALLE.avenida, texto: "Avenida", grosor: 4 },
  { color: COLOR_CALLE.calle, texto: "Calle", grosor: 3 },
  { color: COLOR_CALLE.callejon, texto: "Callejón", grosor: 2 },
  { color: COLOR_CALLE.puente, texto: "Puente", grosor: 4 },
  { color: COLOR_CALLE.bloqueada, texto: "Bloqueada", grosor: 4 },
];

function Punto({ color, opacidad = 1 }: { color: string; opacidad?: number }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, opacity: opacidad }} aria-hidden />;
}

// Persistent legend; colors and icons come from the same constants the map layers use.
export default function Leyenda() {
  return (
    <details
      open
      className="absolute bottom-8 left-3 max-w-[15rem] rounded-lg border border-white/10 bg-neutral-950/85 p-3 text-xs text-neutral-200 shadow-lg backdrop-blur"
    >
      <summary className="cursor-pointer select-none font-semibold text-white">Leyenda</summary>
      <ul className="mt-2 space-y-1">
        {ZOMBIES.map(({ tipo, texto }) => (
          <li key={tipo} className="flex items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
              style={{ backgroundColor: ICONOS_ZOMBIE[tipo].color }}
              aria-hidden
            >
              {ICONOS_ZOMBIE[tipo].emoji}
            </span>
            Zombie {texto.toLowerCase()}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="flex w-5 justify-center"><Punto color={COLOR_ZONA_HORDA} opacidad={0.45} /></span>
          Zona bloqueada por horda
        </li>
        <li className="flex items-center gap-2">
          <span className="flex w-5 justify-center"><Punto color={COLOR_SOBREVIVIENTE.en_ruta} /></span>
          Sobreviviente
        </li>
        <li className="flex items-center gap-2">
          <span className="flex w-5 justify-center"><Punto color={COLOR_SOBREVIVIENTE.mordido} opacidad={0.5} /></span>
          Mordido
        </li>
        <li className="flex items-center gap-2">
          <span className="flex w-5 justify-center"><Punto color={COLOR_REFUGIO} /></span>
          Refugio
        </li>
      </ul>
      <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
        {CALLES.map(({ color, texto, grosor }) => (
          <li key={texto} className="flex items-center gap-2">
            <span className="inline-block w-5 rounded-full" style={{ backgroundColor: color, height: grosor }} aria-hidden />
            {texto}
          </li>
        ))}
      </ul>
    </details>
  );
}
