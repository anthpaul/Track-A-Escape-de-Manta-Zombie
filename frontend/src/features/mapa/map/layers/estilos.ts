import type { CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { LayerProps } from "react-map-gl/maplibre";
import {
  COLOR_CALLE,
  COLOR_FLECHA,
  COLOR_REFUGIO,
  COLOR_RUTA,
  COLOR_SELECCION,
  COLOR_SOBREVIVIENTE,
  COLOR_ZONA_HORDA,
} from "@/features/mapa/simbologia/colores";

// MapLibre layer styles. Colors are data-driven expressions over the shared symbology,
// so one layer styles every feature without per-feature loops.

// Glyphs available on the CARTO Dark Matter font server.
const FUENTE_ETIQUETAS = ["Montserrat SemiBold", "Open Sans Bold", "Noto Sans Regular"];

const esPuenteDanado: ExpressionSpecification = ["all", ["get", "bloqueada"], ["==", ["get", "tipo"], "puente"]];

// The walkable graph, colored by street type. Bridges are a double line (line-gap-width). Blocked
// streets are red, thicker and drawn on top (line-sort-key); damaged bridges have their own layer.
export const capaCalles: LayerProps = {
  id: "calles",
  type: "line",
  filter: ["!", esPuenteDanado],
  layout: {
    "line-cap": "round",
    "line-join": "round",
    "line-sort-key": ["case", ["get", "bloqueada"], 1, 0],
  },
  paint: {
    "line-color": [
      "case",
      ["get", "bloqueada"],
      COLOR_CALLE.bloqueada,
      ["match", ["get", "tipo"],
        "avenida", COLOR_CALLE.avenida,
        "puente", COLOR_CALLE.puente,
        "callejon", COLOR_CALLE.callejon,
        COLOR_CALLE.calle],
    ],
    "line-width": [
      "case",
      ["get", "bloqueada"],
      5,
      ["match", ["get", "tipo"], "avenida", 3.5, "puente", 1.5, "callejon", 1.2, 2],
    ],
    "line-gap-width": ["match", ["get", "tipo"], "puente", 2.5, 0],
    // Quiet network: only blocked streets and bridges are fully opaque.
    "line-opacity": [
      "case",
      ["get", "bloqueada"],
      1,
      ["match", ["get", "tipo"], "puente", 0.9, "avenida", 0.7, "callejon", 0.4, 0.6],
    ],
  },
};

// Damaged bridge (S1): the same double line, dashed in warning orange.
export const capaPuentesDanados: LayerProps = {
  id: "puentes-danados",
  type: "line",
  filter: esPuenteDanado,
  layout: { "line-cap": "butt", "line-join": "round" },
  paint: {
    "line-color": COLOR_CALLE.danado,
    "line-width": 2,
    "line-gap-width": 2.5,
    "line-dasharray": [2, 1.5],
  },
};

// Traffic signs on blocked streets (S1). Stop bars are rotated by the street bearing so they cross it.
export const capaSenales: LayerProps = {
  id: "senales",
  type: "symbol",
  layout: {
    "icon-image": ["concat", "senal-", ["get", "tipo"]],
    "icon-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      // The triangle has no badge behind it, so it is scaled up to read as large as the disc.
      12, ["match", ["get", "tipo"], "tope", 0.3, "peligro", 0.6, 0.4],
      16, ["match", ["get", "tipo"], "tope", 0.5, "peligro", 1.05, 0.75],
    ],
    "icon-rotate": ["match", ["get", "tipo"], "tope", ["get", "rumbo"], 0],
    "icon-rotation-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

// Plain disc under the shelter icon: shelters stay visible even if the Lucide image fails to register.
export const capaRefugiosBase: LayerProps = {
  id: "refugios-base",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 16, 13],
    "circle-color": COLOR_REFUGIO.relleno,
    "circle-stroke-color": COLOR_REFUGIO.borde,
    "circle-stroke-width": 2,
  },
};

export const capaRefugios: LayerProps = {
  id: "refugios",
  type: "symbol",
  layout: {
    "icon-image": "refugio",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.45, 16, 0.8],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

export const capaRefugiosEtiquetas: LayerProps = {
  id: "refugios-etiquetas",
  type: "symbol",
  layout: {
    "text-field": ["get", "nombre"],
    "text-font": FUENTE_ETIQUETAS,
    "text-size": 12,
    // Moves the label to whichever side fits, so it is never cut at the screen edge.
    "text-variable-anchor": ["top", "bottom", "left", "right"],
    "text-radial-offset": 1.2,
    "text-justify": "auto",
  },
  paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.5 },
};

// Shelter nobody can reach this turn: danger ring around the shelter and a "SIN ACCESO" tag under its name.
export const capaRefugiosSinAcceso: LayerProps = {
  id: "refugios-sin-acceso",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 18],
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": COLOR_CALLE.bloqueada,
    "circle-stroke-width": 3,
  },
};

export const capaRefugiosSinAccesoEtiqueta: LayerProps = {
  id: "refugios-sin-acceso-etiqueta",
  type: "symbol",
  layout: {
    "text-field": "SIN ACCESO",
    "text-font": FUENTE_ETIQUETAS,
    "text-size": 11,
    "text-anchor": "top",
    "text-offset": [0, 2.6],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": COLOR_CALLE.bloqueada, "text-halo-color": "#000000", "text-halo-width": 1.5 },
};

// Horde zone: the horde node and every neighbor (same set the router forbids). Only the horde node
// gets one soft ring; each blocked neighbor is a small solid dot, so overlapping zones never pile
// up into a red blob and every forbidden node stays readable.
export const capaZonasHorda: LayerProps = {
  id: "zonas-horda",
  type: "circle",
  paint: {
    // MapLibre only accepts zoom at the top-level interpolate, so the per-origin match goes inside each stop.
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      12, ["match", ["get", "origen"], "horda", 12, 2.5],
      14, ["match", ["get", "origen"], "horda", 18, 3.5],
      16, ["match", ["get", "origen"], "horda", 30, 5],
    ],
    "circle-color": ["match", ["get", "origen"], "horda", COLOR_ZONA_HORDA.relleno, COLOR_ZONA_HORDA.borde],
    "circle-opacity": ["match", ["get", "origen"], "horda", 0.3, 0.9],
    "circle-stroke-color": COLOR_ZONA_HORDA.borde,
    "circle-stroke-width": ["match", ["get", "origen"], "horda", 2, 0],
  },
};

// Survivors on the road and bitten ones are separate layers so each can be switched off (Capas tab).
// Survivors already in a shelter are counted in the panel, not drawn.
const pinturaPersona = (color: string): CircleLayerSpecification["paint"] => ({
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 7],
  "circle-color": color,
  "circle-stroke-color": "#13030d",
  "circle-stroke-width": 1,
});

export const capaSobrevivientes: LayerProps = {
  id: "sobrevivientes",
  type: "circle",
  filter: ["==", ["get", "estado"], "en_ruta"],
  paint: pinturaPersona(COLOR_SOBREVIVIENTE.en_ruta),
};

export const capaMordidos: LayerProps = {
  id: "mordidos",
  type: "circle",
  filter: ["==", ["get", "estado"], "mordido"],
  paint: pinturaPersona(COLOR_SOBREVIVIENTE.mordido),
};

export const capaZombies: LayerProps = {
  id: "zombies",
  type: "symbol",
  layout: {
    "icon-image": ["concat", "zombie-", ["get", "tipo"]],
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.35, 16, 0.7],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

// Next-step arrow per direction; thicker when more survivors take it.
export const capaFlechasLineas: LayerProps = {
  id: "flechas-lineas",
  type: "line",
  layout: { "line-cap": "round" },
  paint: {
    "line-color": COLOR_FLECHA,
    "line-width": ["interpolate", ["linear"], ["get", "cantidad"], 1, 1.5, 20, 4],
    "line-opacity": 0.75,
  },
};

export const capaFlechasPuntas: LayerProps = {
  id: "flechas-puntas",
  type: "symbol",
  layout: {
    "icon-image": "flecha",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 16, 0.6],
    "icon-rotate": ["get", "rumbo"],
    "icon-rotation-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

// Planned route of the followed survivor: dashed tide-blue line (dasharray is in line widths: 10px / 6px at 4px).
export const capaRuta: LayerProps = {
  id: "ruta",
  type: "line",
  layout: { "line-cap": "butt", "line-join": "round" },
  paint: { "line-color": COLOR_RUTA, "line-width": 4, "line-dasharray": [2.5, 1.5] },
};

export const capaSeguido: LayerProps = {
  id: "seguido",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 16, 12],
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": COLOR_SELECCION.sobreviviente,
    "circle-stroke-width": 3,
  },
};

// Selection overlay: shelter = square accent ring (its name is already the shelter label);
// survivor = tide ring with its id above.
const ETIQUETA_SELECCION = {
  "text-font": FUENTE_ETIQUETAS,
  "text-size": 12,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
} as const;

export const capaRefugioSeleccionado: LayerProps = {
  id: "refugio-seleccionado",
  type: "symbol",
  layout: {
    "icon-image": "anillo-refugio",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.9, 16, 1.4],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

export const capaSeguidoEtiqueta: LayerProps = {
  id: "seguido-etiqueta",
  type: "symbol",
  layout: { ...ETIQUETA_SELECCION, "text-field": ["get", "nombre"], "text-anchor": "bottom", "text-offset": [0, -1.4] },
  paint: { "text-color": COLOR_SELECCION.sobreviviente, "text-halo-color": "#13030d", "text-halo-width": 2 },
};
