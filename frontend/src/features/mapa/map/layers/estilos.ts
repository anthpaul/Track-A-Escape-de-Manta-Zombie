import type { CircleLayerSpecification } from "maplibre-gl";
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

// The walkable graph, colored by street type. Blocked streets are red, thicker and drawn on top
// (line-sort-key), so the collapsed bridge (R2) and the blocked streets (R3) always stand out.
export const capaCalles: LayerProps = {
  id: "calles",
  type: "line",
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
      6,
      ["match", ["get", "tipo"], "avenida", 4, "puente", 4, "callejon", 1.5, 2.5],
    ],
    "line-opacity": ["case", ["get", "bloqueada"], 1, 0.85],
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

// Horde zone: the horde node and every neighbor (same set the router forbids). Radius grows with zoom.
export const capaZonasHorda: LayerProps = {
  id: "zonas-horda",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 14, 26, 16, 70],
    "circle-color": COLOR_ZONA_HORDA.relleno,
    "circle-opacity": ["match", ["get", "origen"], "horda", 0.4, 0.25],
    "circle-stroke-color": COLOR_ZONA_HORDA.borde,
    "circle-stroke-width": 1.5,
    "circle-stroke-opacity": 0.8,
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
  layout: { ...ETIQUETA_SELECCION, "text-field": ["get", "id"], "text-anchor": "bottom", "text-offset": [0, -1.4] },
  paint: { "text-color": COLOR_SELECCION.sobreviviente, "text-halo-color": "#13030d", "text-halo-width": 2 },
};
