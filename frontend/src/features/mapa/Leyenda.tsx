"use client";

import { useState } from "react";
import { ChevronDown, List } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { COLOR_CALLE, COLOR_SOBREVIVIENTE, COLOR_ZONA_HORDA } from "./capas/estilos";
import { ICONOS_ZOMBIE, ICONO_REFUGIO } from "./capas/iconos";

const ZOMBIES = [
  { tipo: "caminante", texto: "Zombie caminante" },
  { tipo: "corredor", texto: "Zombie corredor" },
  { tipo: "horda", texto: "Horda" },
] as const;

const CALLES = [
  { color: COLOR_CALLE.avenida, texto: "Avenida", grosor: 4 },
  { color: COLOR_CALLE.calle, texto: "Calle", grosor: 3 },
  { color: COLOR_CALLE.callejon, texto: "Callejón", grosor: 2 },
  { color: COLOR_CALLE.puente, texto: "Puente", grosor: 4 },
  { color: COLOR_CALLE.bloqueada, texto: "Bloqueada", grosor: 4 },
];

function Insignia({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color }} aria-hidden>
      {children}
    </span>
  );
}

function Punto({ color, opacidad = 1 }: { color: string; opacidad?: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color, opacity: opacidad }} />
    </span>
  );
}

// Persistent legend; colors and Lucide icons come from the same constants the map layers use.
export default function Leyenda() {
  const [abierta, setAbierta] = useState(true);
  const IconoRefugio = ICONO_REFUGIO.Icono;

  return (
    <Card size="sm" className="absolute bottom-48 left-3 w-56 bg-card/85 backdrop-blur sm:bottom-8">
      <CardHeader>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex w-full items-center justify-between"
        >
          <CardTitle className="flex items-center gap-1.5 text-base">
            <List className="size-4" aria-hidden />
            Leyenda
          </CardTitle>
          <ChevronDown className={cn("size-4 transition-transform", !abierta && "-rotate-90")} aria-hidden />
        </button>
      </CardHeader>
      {abierta && (
        <CardContent className="space-y-2 text-xs">
          <ul className="space-y-1">
            {ZOMBIES.map(({ tipo, texto }) => {
              const { Icono, color } = ICONOS_ZOMBIE[tipo];
              return (
                <li key={tipo} className="flex items-center gap-2">
                  <Insignia color={color}><Icono className="size-3 text-white" strokeWidth={2.5} /></Insignia>
                  {texto}
                </li>
              );
            })}
            <li className="flex items-center gap-2"><Punto color={COLOR_ZONA_HORDA} opacidad={0.45} />Zona bloqueada por horda</li>
            <li className="flex items-center gap-2"><Punto color={COLOR_SOBREVIVIENTE.en_ruta} />Sobreviviente</li>
            <li className="flex items-center gap-2"><Punto color={COLOR_SOBREVIVIENTE.mordido} opacidad={0.5} />Mordido</li>
            <li className="flex items-center gap-2">
              <Insignia color={ICONO_REFUGIO.color}><IconoRefugio className="size-3 text-white" strokeWidth={2.5} /></Insignia>
              Refugio
            </li>
          </ul>
          <ul className="space-y-1 border-t border-border pt-2">
            {CALLES.map(({ color, texto, grosor }) => (
              <li key={texto} className="flex items-center gap-2">
                <span className="w-5 shrink-0 rounded-full" style={{ backgroundColor: color, height: grosor }} aria-hidden />
                {texto}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
