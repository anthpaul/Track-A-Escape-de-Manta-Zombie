"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Los turnos van cada 2 s: algo más antiguo que esto significa que el flujo se detuvo.
const LIMITE_MS = 5000;

// "EN VIVO" según la edad real del último snapshot, nunca decorativo: un mapa congelado se nota.
export default function IndicadorEnVivo({ generadoEn }: { generadoEn: string }) {
  // El reloj arranca después del montaje: leer Date.now() durante el render daría valores distintos entre el
  // prerender estático y el navegador, y rompería la hidratación.
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
