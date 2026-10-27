"use client";

import { cn } from "@/lib/utils";

type Props = { activo: boolean; onCambiar: () => void; etiqueta: string };

// Accessible on/off switch: pumpkin when on, crimson when off.
export default function Interruptor({ activo, onCambiar, etiqueta }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambiar}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        activo ? "bg-calabaza-500" : "bg-crimson-400",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-calabaza-900 transition-transform",
          activo ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
