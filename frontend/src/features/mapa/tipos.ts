// Static graph types from docs/HOJA_DE_RUTA.md §2 (AGENTS.md §4.1).
// Temporary local copy: replace with the shared/ exports once T0.2 is merged.
export type TipoCalle = "avenida" | "calle" | "callejon" | "puente";

export type Nodo = {
  id: string;
  lat: number;
  lng: number;
  barrio?: "tarqui" | "los_esteros" | "barbasquillo" | "jocay";
};

export type Calle = {
  id: string;
  desde: string;
  hasta: string;
  distancia_m: number;
  tipo: TipoCalle;
  geometria: [number, number][]; // [lng, lat], only for drawing
};

export type Refugio = { id: string; nodo: string; nombre: string; capacidad: number };

export type Grafo = { version: string; nodos: Nodo[]; calles: Calle[]; refugios: Refugio[] };
