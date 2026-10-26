"use client";

import type { Grafo, Sobreviviente } from "./tipos";
import { COLOR_RUTA } from "./capas/estilos";

type Props = { grafo: Grafo; sobreviviente: Sobreviviente | null; ruta: string[]; elegidoAMano: boolean };

const ESTADO: Record<Sobreviviente["estado"], string> = { en_ruta: "En ruta", a_salvo: "A salvo", mordido: "Mordido" };

// Info for the followed survivor, so the planned route on the map is explained without words.
export default function TarjetaSobreviviente({ grafo, sobreviviente, ruta, elegidoAMano }: Props) {
  if (!sobreviviente) return null;
  const destino = grafo.refugios.find((r) => r.nodo === ruta.at(-1));
  const pasos = Math.max(0, ruta.length - 1);

  return (
    <section
      aria-label="Sobreviviente seguido"
      className="absolute bottom-8 left-3 right-3 rounded-lg sm:left-auto sm:w-60 border border-white/10 bg-neutral-950/85 p-3 text-xs text-neutral-200 shadow-lg backdrop-blur"
    >
      <header className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-semibold text-white">
          <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: COLOR_RUTA }} aria-hidden />
          {sobreviviente.id}
        </h2>
        <span className="text-neutral-400">{elegidoAMano ? "elegido" : "seguimiento automático"}</span>
      </header>
      <dl className="space-y-0.5">
        <div className="flex justify-between"><dt className="text-neutral-400">Estado</dt><dd>{ESTADO[sobreviviente.estado]}</dd></div>
        <div className="flex justify-between"><dt className="text-neutral-400">Nodo actual</dt><dd className="tabular-nums">{sobreviviente.nodo}</dd></div>
        <div className="flex justify-between"><dt className="text-neutral-400">Refugio destino</dt><dd>{destino?.nombre ?? "sin ruta segura"}</dd></div>
        <div className="flex justify-between"><dt className="text-neutral-400">Calles restantes</dt><dd className="tabular-nums">{pasos}</dd></div>
      </dl>
      <p className="mt-2 text-neutral-500">Toca otro sobreviviente para seguir su ruta.</p>
    </section>
  );
}
