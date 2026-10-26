import type { LayerProps } from "react-map-gl/maplibre";

// Colors are data-driven expressions, so one layer styles every street without per-feature loops.
export const COLOR_CALLE = {
  avenida: "#f59e0b",
  calle: "#a3a3a3",
  callejon: "#525252",
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
    "text-offset": [0, 1.4],
    "text-anchor": "top",
  },
  paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.5 },
};
