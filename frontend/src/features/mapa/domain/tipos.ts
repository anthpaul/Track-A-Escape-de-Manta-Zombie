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

// Live state, shape of GET /api/estado (AGENTS.md §5). Same temporary-copy note as above.
export type TipoZombie = "caminante" | "corredor" | "horda" | "dormido";
export type Zombie = { id: string; tipo: TipoZombie; nodo: string };

export type EstadoSobreviviente = "en_ruta" | "a_salvo" | "mordido";
export type Sobreviviente = {
  id: string;
  nodo: string;
  estado: EstadoSobreviviente;
  siguienteNodo?: string;
  // Optional: filled by the simulator with the same shared/ route function (AGENTS.md §5).
  refugio?: string | null; // destination shelter id, null when no safe route
  callesRestantes?: number;
};

export type OcupacionRefugio = { id: string; ocupacion: number; capacidad: number };
export type Metricas = { vivos: number; aSalvo: number; mordidos: number; p95ms: number | null };

// Where the snapshot on screen comes from. Every state but en_vivo and reconectando shows the simulation.
export type Conexion =
  | "simulado" // local build without the API (NEXT_PUBLIC_USE_MOCKS unset)
  | "conectando" // waiting for the first answer of GET /api/estado
  | "en_vivo"
  | "reconectando" // last poll failed: the last real world stays a few turns
  | "sin_partida" // the API answers but no game is running
  | "sin_conexion"; // the API fails or breaks the contract

export type Snapshot = {
  turno: number;
  ronda: 1 | 2 | 3;
  zombies: Zombie[]; // visible only: sleepers are never sent
  aristasBloqueadas: string[];
  sobrevivientes: Sobreviviente[];
  refugios: OcupacionRefugio[];
  metricas: Metricas;
  generadoEn: string; // ISO 8601
};
