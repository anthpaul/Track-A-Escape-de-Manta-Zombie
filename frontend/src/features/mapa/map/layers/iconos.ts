import { Biohazard, Navigation2, ShieldCheck, Skull, Zap, type LucideIcon } from "lucide-react";

// Every icon in the app is a Lucide icon. The map uses the same components, serialized to SVG
// and registered as MapLibre images (see RegistroIconos), so legend and map always match.
export const ICONOS_ZOMBIE = {
  caminante: { Icono: Skull, color: "#65a30d" },
  corredor: { Icono: Zap, color: "#ea580c" },
  horda: { Icono: Biohazard, color: "#b91c1c" },
} as const satisfies Record<string, { Icono: LucideIcon; color: string }>;

export type TipoZombieVisible = keyof typeof ICONOS_ZOMBIE;

export const ICONO_REFUGIO = { Icono: ShieldCheck, color: "#16a34a" } as const;

type IconoMapa = { Icono: LucideIcon; fondo: string | null; trazo: string; relleno?: string };

// Map image name → how to draw it. Names are referenced by the symbol layers in estilos.ts.
export const ICONOS_MAPA: Record<string, IconoMapa> = {
  "zombie-caminante": { Icono: ICONOS_ZOMBIE.caminante.Icono, fondo: ICONOS_ZOMBIE.caminante.color, trazo: "#ffffff" },
  "zombie-corredor": { Icono: ICONOS_ZOMBIE.corredor.Icono, fondo: ICONOS_ZOMBIE.corredor.color, trazo: "#ffffff" },
  "zombie-horda": { Icono: ICONOS_ZOMBIE.horda.Icono, fondo: ICONOS_ZOMBIE.horda.color, trazo: "#ffffff" },
  refugio: { Icono: ICONO_REFUGIO.Icono, fondo: ICONO_REFUGIO.color, trazo: "#ffffff" },
  // Arrow head for next-step arrows: points north, rotated by the layer.
  flecha: { Icono: Navigation2, fondo: null, trazo: "#93c5fd", relleno: "#93c5fd" },
};

export const LADO_ICONO = 64; // px, registered at pixelRatio 2

// Wraps a serialized Lucide <svg> in a 64×64 badge (optional colored disc) and returns a data URL.
export function svgIconoMapa(svgLucide: string, fondo: string | null): string {
  const disco = fondo
    ? `<circle cx="32" cy="32" r="29" fill="${fondo}" stroke="#0a0a0a" stroke-width="4"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_ICONO}" height="${LADO_ICONO}">${disco}<g transform="translate(16 16)">${svgLucide}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
