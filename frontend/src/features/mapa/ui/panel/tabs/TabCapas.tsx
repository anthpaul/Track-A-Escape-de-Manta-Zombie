"use client";

import type { CapaClave } from "@/features/mapa/domain/panel";
import { COLOR_REFUGIO, COLOR_RUTA, COLOR_SOBREVIVIENTE, COLOR_ZOMBIE } from "@/features/mapa/simbologia/colores";
import Interruptor from "@/features/mapa/ui/panel/Interruptor";

type Props = {
  capas: Record<CapaClave, boolean>;
  conteos: Record<CapaClave, number>;
  mostrarRuta: boolean;
  onAlternarCapa: (capa: CapaClave) => void;
  onAlternarRuta: () => void;
};

const FILAS: { capa: CapaClave; texto: string; color: string; cuadrado?: boolean }[] = [
  { capa: "caminante", texto: "Zombie caminante", color: COLOR_ZOMBIE.caminante },
  { capa: "corredor", texto: "Zombie corredor", color: COLOR_ZOMBIE.corredor },
  { capa: "horda", texto: "Horda", color: COLOR_ZOMBIE.horda },
  { capa: "sobreviviente", texto: "Sobreviviente", color: COLOR_SOBREVIVIENTE.en_ruta },
  { capa: "mordido", texto: "Mordido", color: COLOR_SOBREVIVIENTE.mordido },
  { capa: "refugio", texto: "Refugio", color: COLOR_REFUGIO.relleno, cuadrado: true },
];

// Show or hide each kind of map element; the counts are what each layer currently draws.
export default function TabCapas(p: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-crimson-800">Muestra u oculta elementos del mapa.</p>
      {FILAS.map(({ capa, texto, color, cuadrado }) => (
        <div key={capa} className="flex items-center gap-2 rounded-lg bg-crimson-100 px-3 py-2">
          <span className={cuadrado ? "size-2.5 rounded-sm" : "size-2.5 rounded-full"} style={{ backgroundColor: color }} aria-hidden />
          <span className="flex-1 text-sm font-semibold text-calabaza-900">{texto}</span>
          <span className="text-xs tabular-nums text-crimson-800">{p.conteos[capa]}</span>
          <Interruptor activo={p.capas[capa]} onCambiar={() => p.onAlternarCapa(capa)} etiqueta={`Mostrar ${texto.toLowerCase()}`} />
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-lg bg-crimson-100 px-3 py-2">
        <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: COLOR_RUTA }} aria-hidden />
        <span className="flex-1 text-sm font-semibold text-calabaza-900">Ruta seleccionada</span>
        <Interruptor activo={p.mostrarRuta} onCambiar={p.onAlternarRuta} etiqueta="Mostrar la ruta seleccionada" />
      </div>
    </div>
  );
}
