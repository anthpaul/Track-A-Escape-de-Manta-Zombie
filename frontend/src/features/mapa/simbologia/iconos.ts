import { Biohazard, Minus, Navigation2, ShieldCheck, Skull, Square, TriangleAlert, Truck, UserRound, UserRoundX, Zap, type LucideIcon } from "lucide-react";
import { COLOR_CALLE, COLOR_FLECHA, COLOR_REFUGIO, COLOR_SELECCION, COLOR_SOBREVIVIENTE, COLOR_VEHICULO, COLOR_ZOMBIE } from "./colores";

// Todos los íconos de la app son de Lucide. El mapa usa los mismos componentes, serializados a SVG
// y registrados como imágenes de MapLibre (map/layers/RegistroIconos.tsx), así la leyenda y el mapa siempre coinciden.
export const ICONOS_ZOMBIE = {
  // Los colores de caminante y corredor son parecidos (1.4:1), así que se distinguen por la forma del ícono.
  // Además del color, cada tipo tiene su forma: rombo, hexágono y octágono.
  caminante: { Icono: Skull, color: COLOR_ZOMBIE.caminante, forma: "rombo" },
  corredor: { Icono: Zap, color: COLOR_ZOMBIE.corredor, forma: "hexagono" },
  horda: { Icono: Biohazard, color: COLOR_ZOMBIE.horda, forma: "octagono" },
} as const satisfies Record<string, { Icono: LucideIcon; color: string; forma: string }>;

export type TipoZombieVisible = keyof typeof ICONOS_ZOMBIE;

// Personas: el ícono de persona, con una X cuando fue mordida (el color también lo dice).
export const ICONOS_PERSONA = {
  en_ruta: { Icono: UserRound, color: COLOR_SOBREVIVIENTE.en_ruta },
  mordido: { Icono: UserRoundX, color: COLOR_SOBREVIVIENTE.mordido },
} as const;

export const ICONO_REFUGIO = { Icono: ShieldCheck, color: COLOR_REFUGIO.relleno, borde: COLOR_REFUGIO.borde, forma: "cuadrado" } as const;
export const ICONO_VEHICULO = { Icono: Truck, color: COLOR_VEHICULO.relleno, borde: COLOR_VEHICULO.borde, forma: "pentagono" } as const;

// Cada entidad del mapa tiene su propia forma: zombies, refugios y camionetas nunca son círculos ni triángulos y
// ninguna forma se repite. Los círculos quedan para las personas (bolita con el ícono) y la señal de prohibido el paso.
export type FormaIcono = "disco" | "cuadrado" | "rombo" | "pentagono" | "hexagono" | "octagono";
type FormaPoligono = Exclude<FormaIcono, "disco" | "cuadrado">;

// Vértices normalizados (0 a 1) de cada polígono: los usa la insignia SVG del mapa y el recorte CSS de la leyenda.
const POLIGONOS: Record<FormaPoligono, readonly (readonly [number, number])[]> = {
  rombo: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagono: [[0.5, 0], [1, 0.38], [0.82, 1], [0.18, 1], [0, 0.38]],
  hexagono: [[0.25, 0.06], [0.75, 0.06], [1, 0.5], [0.75, 0.94], [0.25, 0.94], [0, 0.5]],
  octagono: [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]],
};

/** La misma forma como `clip-path` de CSS, para la leyenda. */
export function clipPathForma(forma: FormaPoligono): string {
  return `polygon(${POLIGONOS[forma].map(([x, y]) => `${Math.round(x * 100)}% ${Math.round(y * 100)}%`).join(", ")})`;
}

type IconoMapa = {
  Icono: LucideIcon;
  fondo: string | null;
  trazo: string;
  relleno?: string;
  forma?: FormaIcono;
  borde?: string;
  grosor?: number; // grosor de trazo de Lucide, 2.25 por defecto
  halo?: string; // contorno oscuro detrás de un ícono sin insignia, para que se lea sobre el mapa
};

// Nombre de imagen del mapa → cómo dibujarla. Las capas de símbolos de estilos.ts hacen referencia a estos nombres.
export const ICONOS_MAPA: Record<string, IconoMapa> = {
  "zombie-caminante": { Icono: ICONOS_ZOMBIE.caminante.Icono, fondo: ICONOS_ZOMBIE.caminante.color, trazo: "#ffffff", forma: ICONOS_ZOMBIE.caminante.forma },
  "zombie-corredor": { Icono: ICONOS_ZOMBIE.corredor.Icono, fondo: ICONOS_ZOMBIE.corredor.color, trazo: "#ffffff", forma: ICONOS_ZOMBIE.corredor.forma },
  "zombie-horda": { Icono: ICONOS_ZOMBIE.horda.Icono, fondo: ICONOS_ZOMBIE.horda.color, trazo: "#ffffff", forma: ICONOS_ZOMBIE.horda.forma },
  // Personas: una bolita del color de su estado con el ícono de persona en negro adentro, para que se lea.
  persona: { Icono: ICONOS_PERSONA.en_ruta.Icono, fondo: ICONOS_PERSONA.en_ruta.color, trazo: "#13030d", grosor: 2.75 },
  "persona-mordida": { Icono: ICONOS_PERSONA.mordido.Icono, fondo: ICONOS_PERSONA.mordido.color, trazo: "#13030d", grosor: 2.75 },
  refugio: { Icono: ICONO_REFUGIO.Icono, fondo: ICONO_REFUGIO.color, trazo: ICONO_REFUGIO.borde, forma: "cuadrado", borde: ICONO_REFUGIO.borde },
  // Punta de las flechas del siguiente paso: apunta al norte y la capa la rota.
  flecha: { Icono: Navigation2, fondo: null, trazo: COLOR_FLECHA, relleno: COLOR_FLECHA },
  // Anillo alrededor del refugio seleccionado.
  "anillo-refugio": { Icono: Square, fondo: null, trazo: COLOR_SELECCION.refugio },
  // Marco rojo de un refugio sin acceso: cuadrado, como el refugio, no un círculo.
  "anillo-sin-acceso": { Icono: Square, fondo: null, trazo: COLOR_CALLE.bloqueada, grosor: 3 },
  // Señales de tránsito en calles bloqueadas (S1): disco de prohibido el paso, triángulo de peligro y la barra de pare en cada extremo
  // (horizontal con rotación 0, rotada según el rumbo de la calle para que la cruce).
  "senal-prohibido": { Icono: Minus, fondo: COLOR_CALLE.bloqueada, trazo: "#ffffff", borde: "#ffffff", grosor: 4 },
  "senal-peligro": { Icono: TriangleAlert, fondo: null, trazo: "#13030d", relleno: COLOR_CALLE.danado },
  "senal-tope": { Icono: Minus, fondo: null, trazo: COLOR_CALLE.bloqueada, grosor: 5 },
  // Camioneta de rescate (Pro).
  vehiculo: { Icono: ICONO_VEHICULO.Icono, fondo: ICONO_VEHICULO.color, trazo: ICONO_VEHICULO.borde, borde: ICONO_VEHICULO.borde, forma: ICONO_VEHICULO.forma },
};

export const LADO_ICONO = 64; // px, registrado con pixelRatio 2

// En el rombo y el pentágono el ícono va más chico (y el del pentágono, un poco más abajo) para que no se salga.
const ICONO_EN_FORMA: Partial<Record<FormaIcono, { escala: number; bajar: number }>> = {
  rombo: { escala: 0.7, bajar: 0 },
  pentagono: { escala: 0.8, bajar: 3 },
};

// Envuelve un <svg> serializado de Lucide en una insignia de 64×64 (opcional, con la forma de la entidad) y devuelve
// una data URL. Con `halo`, dibuja primero el mismo ícono más grueso en ese color, como contorno.
export function svgIconoMapa(svgLucide: string, fondo: string | null, forma: FormaIcono = "disco", borde = "#0a0a0a", halo?: string): string {
  let base = "";
  if (fondo && forma === "cuadrado") base = `<rect x="4" y="4" width="56" height="56" rx="6" fill="${fondo}" stroke="${borde}" stroke-width="5"/>`;
  else if (fondo && forma === "disco") base = `<circle cx="32" cy="32" r="29" fill="${fondo}" stroke="${borde}" stroke-width="4"/>`;
  else if (fondo) {
    const puntos = POLIGONOS[forma as FormaPoligono].map(([x, y]) => `${(4 + x * 56).toFixed(1)},${(4 + y * 56).toFixed(1)}`).join(" ");
    base = `<polygon points="${puntos}" fill="${fondo}" stroke="${borde}" stroke-width="4" stroke-linejoin="round"/>`;
  }
  const contorno = halo
    ? svgLucide
        .replace(/stroke="[^"]*"/, `stroke="${halo}"`)
        .replace(/stroke-width="([\d.]+)"/, (_, w: string) => `stroke-width="${Number(w) + 3}"`)
    : "";
  const { escala, bajar } = ICONO_EN_FORMA[forma] ?? { escala: 1, bajar: 0 };
  const desplazamiento = (LADO_ICONO - 32 * escala) / 2;
  const transformacion = `translate(${desplazamiento} ${desplazamiento + bajar})${escala === 1 ? "" : ` scale(${escala})`}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_ICONO}" height="${LADO_ICONO}">${base}<g transform="${transformacion}">${contorno}${svgLucide}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
