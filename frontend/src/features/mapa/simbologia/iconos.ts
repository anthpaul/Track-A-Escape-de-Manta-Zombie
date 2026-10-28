import { Biohazard, Minus, Navigation2, ShieldCheck, Skull, Square, TriangleAlert, Truck, Zap, type LucideIcon } from "lucide-react";
import { COLOR_CALLE, COLOR_FLECHA, COLOR_REFUGIO, COLOR_SELECCION, COLOR_VEHICULO, COLOR_ZOMBIE } from "./colores";

// Every icon in the app is a Lucide icon. The map uses the same components, serialized to SVG
// and registered as MapLibre images (map/layers/RegistroIconos.tsx), so legend and map always match.
export const ICONOS_ZOMBIE = {
  // Walker and runner colors are close (1.4:1), so they are told apart by their icon shape.
  caminante: { Icono: Skull, color: COLOR_ZOMBIE.caminante },
  corredor: { Icono: Zap, color: COLOR_ZOMBIE.corredor },
  horda: { Icono: Biohazard, color: COLOR_ZOMBIE.horda },
} as const satisfies Record<string, { Icono: LucideIcon; color: string }>;

export type TipoZombieVisible = keyof typeof ICONOS_ZOMBIE;

export const ICONO_REFUGIO = { Icono: ShieldCheck, color: COLOR_REFUGIO.relleno, borde: COLOR_REFUGIO.borde } as const;
export const ICONO_VEHICULO = { Icono: Truck, color: COLOR_VEHICULO.relleno, borde: COLOR_VEHICULO.borde } as const;

export type FormaIcono = "disco" | "cuadrado";
type IconoMapa = {
  Icono: LucideIcon;
  fondo: string | null;
  trazo: string;
  relleno?: string;
  forma?: FormaIcono;
  borde?: string;
  grosor?: number; // Lucide stroke width, 2.25 by default
};

// Map image name → how to draw it. Names are referenced by the symbol layers in estilos.ts.
export const ICONOS_MAPA: Record<string, IconoMapa> = {
  "zombie-caminante": { Icono: ICONOS_ZOMBIE.caminante.Icono, fondo: ICONOS_ZOMBIE.caminante.color, trazo: "#ffffff" },
  "zombie-corredor": { Icono: ICONOS_ZOMBIE.corredor.Icono, fondo: ICONOS_ZOMBIE.corredor.color, trazo: "#ffffff" },
  "zombie-horda": { Icono: ICONOS_ZOMBIE.horda.Icono, fondo: ICONOS_ZOMBIE.horda.color, trazo: "#ffffff" },
  refugio: { Icono: ICONO_REFUGIO.Icono, fondo: ICONO_REFUGIO.color, trazo: ICONO_REFUGIO.borde, forma: "cuadrado", borde: ICONO_REFUGIO.borde },
  // Arrow head for next-step arrows: points north, rotated by the layer.
  flecha: { Icono: Navigation2, fondo: null, trazo: COLOR_FLECHA, relleno: COLOR_FLECHA },
  // Ring around the selected shelter.
  "anillo-refugio": { Icono: Square, fondo: null, trazo: COLOR_SELECCION.refugio },
  // Traffic signs on blocked streets (S1): no-entry disc, danger triangle and the stop bar at each end
  // (horizontal at rotation 0, rotated by the street bearing so it crosses the street).
  "senal-prohibido": { Icono: Minus, fondo: COLOR_CALLE.bloqueada, trazo: "#ffffff", borde: "#ffffff", grosor: 4 },
  "senal-peligro": { Icono: TriangleAlert, fondo: null, trazo: "#13030d", relleno: COLOR_CALLE.danado },
  "senal-tope": { Icono: Minus, fondo: null, trazo: COLOR_CALLE.bloqueada, grosor: 5 },
  // Rescue van (Pro).
  vehiculo: { Icono: ICONO_VEHICULO.Icono, fondo: ICONO_VEHICULO.color, trazo: ICONO_VEHICULO.borde, borde: ICONO_VEHICULO.borde },
};

export const LADO_ICONO = 64; // px, registered at pixelRatio 2

// Wraps a serialized Lucide <svg> in a 64×64 badge (disc or square, optional) and returns a data URL.
export function svgIconoMapa(svgLucide: string, fondo: string | null, forma: FormaIcono = "disco", borde = "#0a0a0a"): string {
  const base = !fondo
    ? ""
    : forma === "cuadrado"
      ? `<rect x="4" y="4" width="56" height="56" rx="6" fill="${fondo}" stroke="${borde}" stroke-width="5"/>`
      : `<circle cx="32" cy="32" r="29" fill="${fondo}" stroke="${borde}" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_ICONO}" height="${LADO_ICONO}">${base}<g transform="translate(16 16)">${svgLucide}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
