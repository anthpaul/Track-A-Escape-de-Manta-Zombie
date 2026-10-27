// Base map settings. The CARTO style already declares the OSM + CARTO attribution,
// so MapLibre's attribution control renders it without a custom string.
export const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Center of the real graph (shared/data/manta.json): Barbasquillo, Tarqui, Los Esteros and Jocay.
export const MANTA_CENTER = { longitude: -80.7058, latitude: -0.9477 } as const;

// [west, south, east, north]
export const MANTA_BOUNDS: [number, number, number, number] = [-80.82, -1.02, -80.62, -0.9];

export const INITIAL_ZOOM = 13.2;
export const MIN_ZOOM = 12;
