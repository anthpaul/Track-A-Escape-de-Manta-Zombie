import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
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

// Estilos de las capas de MapLibre. Los colores son expresiones basadas en datos sobre la simbología compartida,
// así una sola capa da estilo a cada feature sin recorrerlas una por una.

// Glifos disponibles en el servidor de fuentes de CARTO Dark Matter.
const FUENTE_ETIQUETAS = ["Montserrat SemiBold", "Open Sans Bold", "Noto Sans Regular"];

const esPuenteDanado: ExpressionSpecification = ["all", ["get", "bloqueada"], ["==", ["get", "tipo"], "puente"]];

// El grafo caminable, coloreado por tipo de calle. Los puentes son una línea doble (line-gap-width). Las calles
// bloqueadas son rojas, más gruesas y se dibujan encima (line-sort-key); los puentes dañados tienen su propia capa.
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
    // Red discreta: solo las calles bloqueadas y los puentes son totalmente opacos.
    "line-opacity": [
      "case",
      ["get", "bloqueada"],
      1,
      ["match", ["get", "tipo"], "puente", 0.9, "avenida", 0.7, "callejon", 0.4, 0.6],
    ],
  },
};

// Puente dañado (S1): la misma línea doble, punteada en naranja de advertencia.
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

// Señales de tránsito en calles bloqueadas (S1). Las barras de pare se rotan según el rumbo de la calle para que la crucen.
export const capaSenales: LayerProps = {
  id: "senales",
  type: "symbol",
  layout: {
    "icon-image": ["concat", "senal-", ["get", "tipo"]],
    "icon-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      // El triángulo no tiene insignia detrás, así que se agranda para que se lea tan grande como el disco.
      12, ["match", ["get", "tipo"], "tope", 0.3, "peligro", 0.6, 0.4],
      16, ["match", ["get", "tipo"], "tope", 0.5, "peligro", 1.05, 0.75],
    ],
    "icon-rotate": ["match", ["get", "tipo"], "tope", ["get", "rumbo"], 0],
    "icon-rotation-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
};

// Disco simple bajo el ícono del refugio: los refugios siguen visibles aunque la imagen de Lucide no se registre.
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
    // Mueve la etiqueta al lado donde quepa, para que nunca se corte en el borde de la pantalla.
    "text-variable-anchor": ["top", "bottom", "left", "right"],
    "text-radial-offset": 1.2,
    "text-justify": "auto",
  },
  paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.5 },
};

// Refugio que nadie puede alcanzar en este turno: anillo de peligro alrededor y una etiqueta "SIN ACCESO" bajo su nombre.
export const capaRefugiosSinAcceso: LayerProps = {
  id: "refugios-sin-acceso",
  type: "symbol",
  layout: {
    "icon-image": "anillo-sin-acceso",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.9, 16, 1.4],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
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

// Zona de horda: el nodo de la horda y todos sus vecinos (el mismo conjunto que prohíbe el motor). Solo el nodo de la horda
// lleva un anillo suave; cada vecino bloqueado es un punto sólido pequeño, así las zonas superpuestas nunca se
// amontonan en una mancha roja y cada nodo prohibido sigue siendo legible.
export const capaZonasHorda: LayerProps = {
  id: "zonas-horda",
  type: "circle",
  paint: {
    // MapLibre solo acepta zoom en el interpolate de primer nivel, así que el match por origen va dentro de cada parada.
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

// Camionetas de rescate (Pro): insignia crema con un camión y, al lado, cuántas personas viajan en ella.
export const capaVehiculos: LayerProps = {
  id: "vehiculos",
  type: "symbol",
  layout: {
    "icon-image": "vehiculo",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.45, 16, 0.85],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "text-field": ["case", [">", ["get", "pasajeros"], 0], ["concat", ["to-string", ["get", "pasajeros"]], "/4"], ""],
    "text-font": FUENTE_ETIQUETAS,
    "text-size": 11,
    "text-anchor": "left",
    "text-offset": [1.1, 0],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": "#fee8d3", "text-halo-color": "#13030d", "text-halo-width": 1.5 },
};

// Los sobrevivientes en camino y los mordidos son capas separadas para poder apagar cada una (pestaña Capas).
// Los sobrevivientes que ya están en un refugio se cuentan en el panel, no se dibujan.
// Personas: bolita del color de su estado con el ícono de persona en negro (con una X si fue mordida).
const disposicionPersona = (imagen: string): SymbolLayerSpecification["layout"] => ({
  "icon-image": imagen,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.32, 16, 0.62],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
});

export const capaSobrevivientes: LayerProps = {
  id: "sobrevivientes",
  type: "symbol",
  filter: ["==", ["get", "estado"], "en_ruta"],
  layout: disposicionPersona("persona"),
};

export const capaMordidos: LayerProps = {
  id: "mordidos",
  type: "symbol",
  filter: ["==", ["get", "estado"], "mordido"],
  layout: disposicionPersona("persona-mordida"),
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

// Flecha del siguiente paso por dirección; más gruesa cuantos más sobrevivientes la toman.
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

// Ruta planificada del sobreviviente seguido: línea punteada azul marea (dasharray va en anchos de línea: 10px / 6px a 4px).
export const capaRuta: LayerProps = {
  id: "ruta",
  type: "line",
  layout: { "line-cap": "butt", "line-join": "round" },
  paint: { "line-color": COLOR_RUTA, "line-width": 4, "line-dasharray": [2.5, 1.5] },
};

// El anillo y la etiqueta de la persona seguida toman el color de su estado: rosa si fue mordida, azul marea si no.
const colorSeguido: ExpressionSpecification = [
  "match",
  ["get", "estado"],
  "mordido",
  COLOR_SOBREVIVIENTE.mordido,
  COLOR_SELECCION.sobreviviente,
];

export const capaSeguido: LayerProps = {
  id: "seguido",
  type: "circle",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 16, 12],
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": colorSeguido,
    "circle-stroke-width": 3,
  },
};

// Capa de selección: refugio = anillo cuadrado de acento (su nombre ya es la etiqueta del refugio);
// sobreviviente = anillo marea con su id encima.
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
  paint: { "text-color": colorSeguido, "text-halo-color": "#13030d", "text-halo-width": 2 },
};
