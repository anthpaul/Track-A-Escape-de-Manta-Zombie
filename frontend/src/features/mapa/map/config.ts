// Configuración del mapa base. El estilo de CARTO ya declara la atribución de OSM + CARTO,
// así que el control de atribución de MapLibre la muestra sin un texto propio.
export const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Centro del grafo real (shared/data/manta.json): Barbasquillo, Tarqui, Los Esteros y Jocay.
export const MANTA_CENTER = { longitude: -80.7058, latitude: -0.9477 } as const;

// [oeste, sur, este, norte]
export const MANTA_BOUNDS: [number, number, number, number] = [-80.82, -1.02, -80.62, -0.9];

export const INITIAL_ZOOM = 13.2;
export const MIN_ZOOM = 12;
