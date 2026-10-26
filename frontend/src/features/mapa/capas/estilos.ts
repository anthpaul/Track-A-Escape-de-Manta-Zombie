import type { LayerProps } from "react-map-gl/maplibre";

// Colors are data-driven expressions, so one layer styles every street without per-feature loops.
export const COLOR_CALLE = {
  avenida: "#f59e0b",
  calle: "#d4d4d4",
  callejon: "#8a8a8a",
  puente: "#38bdf8",
  bloqueada: "#ef4444",
} as const;

export const COLOR_REFUGIO = "#22c55e";

// Glyphs available on the CARTO Dark Matter font server.
const FUENTE_ETIQUETAS = ["Montserrat SemiBold", "Open Sans Bold", "Noto Sans Regular"];

export const capaCalles: LayerProps = {
  id: "calles",
  type: "line",
  layout: { "line-cap": "round", "line-join": "round" },
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
    "line-width": ["match", ["get", "tipo"], "avenida", 5, "puente", 5, "callejon", 2, 3],
    "line-opacity": 0.9,
  },
};

export const capaRefugios: LayerProps = {
  id: "refugios",
  type: "circle",
  paint: {
    "circle-radius": 9,
    "circle-color": COLOR_REFUGIO,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 2,
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

export const COLOR_SOBREVIVIENTE = { en_ruta: "#60a5fa", mordido: "#737373" } as const;
export const COLOR_ZONA_HORDA = "#ef4444";

// Horde zone: the horde node and every neighbor (same set the router forbids). Radius grows with zoom.
export const capaZonasHorda: LayerProps = {
  id: "zonas-horda",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 14, 26, 16, 70],
    "circle-color": COLOR_ZONA_HORDA,
    "circle-opacity": ["match", ["get", "origen"], "horda", 0.35, 0.18],
    "circle-stroke-color": COLOR_ZONA_HORDA,
    "circle-stroke-width": 1,
    "circle-stroke-opacity": 0.5,
  },
};

// Survivors already in a shelter are counted in the panel, not drawn.
export const capaSobrevivientes: LayerProps = {
  id: "sobrevivientes",
  type: "circle",
  filter: ["!=", ["get", "estado"], "a_salvo"],
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 6],
    "circle-color": ["match", ["get", "estado"], "mordido", COLOR_SOBREVIVIENTE.mordido, COLOR_SOBREVIVIENTE.en_ruta],
    "circle-opacity": ["match", ["get", "estado"], "mordido", 0.45, 0.95],
    "circle-stroke-color": "#0a0a0a",
    "circle-stroke-width": 0.5,
  },
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
