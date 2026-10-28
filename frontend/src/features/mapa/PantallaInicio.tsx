"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { grafoManta } from "@/features/mapa/data/real/grafo-manta";
import { USAR_MOCKS, useEstadoEnVivo } from "@/features/mapa/data/real/useEstadoEnVivo";
import EstadoRonda from "@/features/mapa/ui/inicio/EstadoRonda";
import FondoGrafo from "@/features/mapa/ui/inicio/FondoGrafo";
import RefugiosInicio, { type FilaRefugio } from "@/features/mapa/ui/inicio/RefugiosInicio";

// Solo lo que el motor hace de verdad: calcula rutas en cada turno, predice a los corredores, nunca envía a nadie a un refugio lleno
// y opera una flota de rescate en las rondas de demo.
const PASOS = [
  {
    titulo: "Turnos de 2 segundos",
    texto: "En cada turno los zombies se mueven primero: caminantes, corredores que persiguen, hordas que bloquean su zona y dormidos que despiertan. Después, cada sobreviviente da un paso.",
  },
  {
    titulo: "El mapa cambia",
    texto: "Un puente colapsa o una calle se bloquea en plena ronda. El motor recalcula la ruta de cada sobreviviente en cada turno: nunca sigue una ruta vieja.",
  },
  {
    titulo: "Hacia el refugio",
    texto: "El motor busca el camino más corto en turnos hasta el refugio más conveniente, esquivando zombies y anticipando a los corredores. Cada refugio tiene 50 lugares y nadie es enviado a uno lleno, y cinco camionetas de rescate buscan primero a quien está en peligro. Responde en milisegundos.",
  },
];

// Landing pública (N5): qué es, cómo funciona, los refugios en vivo y el acceso al mapa en vivo.
export default function PantallaInicio() {
  const grafo = grafoManta;
  const vivo = useEstadoEnVivo(grafo, !USAR_MOCKS);

  const filas = useMemo<FilaRefugio[]>(
    () =>
      grafo.refugios.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        capacidad: r.capacidad,
        ocupacion: vivo.snapshot?.refugios.find((o) => o.id === r.id)?.ocupacion ?? null,
      })),
    [grafo, vivo.snapshot],
  );

  const enlace = "font-pixel text-xs";
  return (
    <div className="flex min-h-full flex-col bg-background text-calabaza-900">
      <header className="sticky top-0 z-20 border-b border-crimson-300 bg-background/90 backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="font-pixel text-sm text-calabaza-500">
            Escape de Manta
          </Link>
          <div className="flex items-center gap-4 text-sm sm:gap-6">
            <a href="#como-funciona" className="hidden hover:text-calabaza-500 sm:inline">Cómo funciona</a>
            <a href="#refugios" className="hidden hover:text-calabaza-500 sm:inline">Refugios</a>
            <Link href="/mapa" className="font-semibold text-calabaza-500 hover:underline">Mapa en vivo</Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-crimson-300">
          <FondoGrafo grafo={grafo} />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" aria-hidden />
          <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-20 sm:py-28">
            <EstadoRonda conexion={vivo.conexion} ronda={vivo.snapshot?.ronda ?? null} turno={vivo.snapshot?.turno ?? null} />
            <h1 className="font-pixel text-5xl leading-none text-calabaza-500 [text-shadow:4px_4px_0_#9a031e] sm:text-7xl">
              Escape de Manta
            </h1>
            <p className="max-w-xl text-lg leading-relaxed">
              La noche del 31 de octubre, Manta amanece infestada. Nuestro motor de rutas guía a cada sobreviviente, paso a paso y en
              tiempo real, hacia un refugio sin ser mordido, mientras el mapa cambia a su alrededor.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/mapa" className={cn(buttonVariants(), enlace, "h-11 px-5 [box-shadow:4px_4px_0_#9a031e]")}>
                Ver mapa en vivo
              </Link>
              <a href="#como-funciona" className={cn(buttonVariants({ variant: "outline" }), enlace, "h-11 border-crimson-600 px-5")}>
                Cómo funciona
              </a>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
          <h2 className="mb-8 font-pixel text-3xl text-calabaza-500 [text-shadow:3px_3px_0_#9a031e]">Cómo funciona</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {PASOS.map((paso, i) => (
              <li key={paso.titulo} className="rounded-lg border border-crimson-300 bg-card p-5">
                <span className="font-pixel text-2xl text-calabaza-500">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 font-semibold">{paso.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-crimson-800">{paso.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="refugios" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-20 pt-4">
          <h2 className="mb-2 font-pixel text-3xl text-calabaza-500 [text-shadow:3px_3px_0_#9a031e]">Refugios</h2>
          <p className="mb-6 text-sm text-crimson-800">
            Los cuatro refugios reales de la simulación. Con una ronda en curso, se ve cuántas personas llegaron a cada uno.
          </p>
          <RefugiosInicio filas={filas} />
          <Link href="/mapa" className={cn(buttonVariants(), enlace, "mt-8 h-11 px-5 [box-shadow:4px_4px_0_#9a031e]")}>
            Ver mapa en vivo
          </Link>
        </section>
      </main>

      <footer className="border-t border-crimson-300">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-crimson-800">
          <span className="font-pixel text-calabaza-500">Escape de Manta · SpookyThon 2026 · abcstack</span>
          <span>Datos del mapa © colaboradores de OpenStreetMap · CARTO</span>
        </div>
      </footer>
    </div>
  );
}
