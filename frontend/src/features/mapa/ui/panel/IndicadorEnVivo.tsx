"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Turns are 2 s apart: older than this means the feed stopped.
const LIMITE_MS = 5000;

// "EN VIVO" based on the real age of the last snapshot, never decorative: a frozen map shows it.
export default function IndicadorEnVivo({ generadoEn }: { generadoEn: string }) {
  // The clock starts after mount: reading Date.now() during render would differ between the static
  // prerender and the browser and break hydration.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (ahora === null) {
    return <span className="inline-flex items-center gap-1.5 font-pixel text-[10px] text-crimson-800">CONECTANDO…</span>;
  }

  const edad = ahora - new Date(generadoEn).getTime();
  const enVivo = Number.isFinite(edad) && edad < LIMITE_MS;

  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 font-pixel text-[10px]", enVivo ? "text-marea-700" : "text-sangre-700")}>
      <span className={cn("size-2 rounded-full", enVivo ? "animate-pulse bg-marea-700" : "bg-sangre-700")} aria-hidden />
      {enVivo ? "EN VIVO" : `SIN SEÑAL · ${Math.round(edad / 1000)} s`}
    </span>
  );
}
