"use client";

import { Crosshair, MapPin, MousePointerClick, Route, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card
      size="sm"
      aria-label="Sobreviviente seguido"
      className="absolute bottom-8 left-3 right-3 bg-card/85 backdrop-blur sm:left-auto sm:w-64"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base text-primary">
          <UserRound className="size-4" style={{ color: COLOR_RUTA }} aria-hidden />
          {sobreviviente.id}
        </CardTitle>
        <CardDescription className="flex items-center gap-1 text-xs">
          <Crosshair className="size-3" aria-hidden />
          {elegidoAMano ? "Elegido en el mapa" : "Seguimiento automático"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between"><dt className="text-muted-foreground">Estado</dt><dd>{ESTADO[sobreviviente.estado]}</dd></div>
          <div className="flex justify-between">
            <dt className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" aria-hidden />Nodo actual</dt>
            <dd className="tabular-nums">{sobreviviente.nodo}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="size-3" aria-hidden />Refugio destino</dt>
            <dd>{destino?.nombre ?? "sin ruta segura"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="flex items-center gap-1 text-muted-foreground"><Route className="size-3" aria-hidden />Calles restantes</dt>
            <dd className="tabular-nums">{pasos}</dd>
          </div>
        </dl>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <MousePointerClick className="size-3" aria-hidden />
          Toca otro sobreviviente para seguir su ruta.
        </p>
      </CardContent>
    </Card>
  );
}
