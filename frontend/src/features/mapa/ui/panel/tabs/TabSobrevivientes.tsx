"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FiltroSobreviviente } from "@/features/mapa/domain/panel";
import type { EstadoSobreviviente, Grafo, Sobreviviente } from "@/features/mapa/domain/tipos";

type Props = {
  grafo: Grafo;
  lista: Sobreviviente[];
  conteos: Record<FiltroSobreviviente, number>;
  busqueda: string;
  filtro: FiltroSobreviviente;
  seleccionado: Sobreviviente | null;
  onBuscar: (texto: string) => void;
  onFiltrar: (filtro: FiltroSobreviviente) => void;
  onSeleccionar: (id: string) => void;
};

const CHIPS: { filtro: FiltroSobreviviente; texto: string }[] = [
  { filtro: "todos", texto: "Todos" },
  { filtro: "en_ruta", texto: "En ruta" },
  { filtro: "mordido", texto: "Mordido" },
  { filtro: "a_salvo", texto: "A salvo" },
];

const ESTADO: Record<EstadoSobreviviente, { texto: string; punto: string }> = {
  en_ruta: { texto: "En ruta", punto: "bg-marea-700" },
  mordido: { texto: "Mordido", punto: "bg-crimson-700" },
  a_salvo: { texto: "A salvo", punto: "bg-marea-900" },
};

export default function TabSobrevivientes(p: Props) {
  const nombreRefugio = (id?: string | null) => p.grafo.refugios.find((r) => r.id === id)?.nombre;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-crimson-800" aria-hidden />
        <Input
          aria-label="Buscar sobreviviente por ID o refugio"
          placeholder="Buscar ID o refugio…"
          value={p.busqueda}
          onChange={(e) => p.onBuscar(e.target.value)}
          className="border-crimson-300 bg-crimson-100 pl-8 text-calabaza-900 placeholder:text-crimson-800/70"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map(({ filtro, texto }) => (
          <button
            key={filtro}
            type="button"
            aria-pressed={p.filtro === filtro}
            onClick={() => p.onFiltrar(filtro)}
            className={cn(
              "min-h-8 rounded-full border px-3 py-1 text-xs font-semibold md:min-h-0 md:py-0.5",
              p.filtro === filtro ? "border-calabaza-500 bg-calabaza-500 text-crimson-100" : "border-crimson-600 text-calabaza-900 hover:bg-crimson-300",
            )}
          >
            {texto} · {p.conteos[filtro]}
          </button>
        ))}
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {p.lista.length === 0 && <li className="py-4 text-center text-sm text-crimson-800">Sin resultados.</li>}
        {p.lista.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => p.onSeleccionar(s.id)}
              aria-pressed={p.seleccionado?.id === s.id}
              className={cn(
                "grid w-full grid-cols-[10px_64px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                p.seleccionado?.id === s.id ? "bg-crimson-300" : "hover:bg-crimson-300/60",
              )}
            >
              <span className={cn("size-2 rounded-full", ESTADO[s.estado].punto)} aria-hidden />
              <span className="font-pixel text-xs text-calabaza-500">{s.id}</span>
              <span className="text-calabaza-900">{ESTADO[s.estado].texto}</span>
              <span className="text-xs text-crimson-800">{s.callesRestantes !== undefined ? `${s.callesRestantes} calles` : ""}</span>
            </button>
          </li>
        ))}
      </ul>

      {p.seleccionado && (
        <div className="rounded-lg border border-marea-700 bg-crimson-100 p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-pixel text-marea-700">{p.seleccionado.id}</span>
            <span className="text-calabaza-900">{ESTADO[p.seleccionado.estado].texto}</span>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt className="text-crimson-800">Nodo</dt><dd className="font-pixel text-xs text-calabaza-900">{p.seleccionado.nodo}</dd></div>
            <div className="flex justify-between"><dt className="text-crimson-800">Destino</dt><dd className="text-calabaza-900">{nombreRefugio(p.seleccionado.refugio) ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-crimson-800">Calles restantes</dt><dd className="text-calabaza-900">{p.seleccionado.callesRestantes ?? "—"}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
