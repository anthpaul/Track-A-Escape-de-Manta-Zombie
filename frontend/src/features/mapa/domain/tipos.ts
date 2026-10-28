// Tipos del grafo estático según docs/HOJA_DE_RUTA.md §2 (AGENTS.md §4.1).
// Copia local temporal: reemplazar por los exports de shared/ cuando se integre T0.2.
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
  geometria: [number, number][]; // [lng, lat], solo para dibujar
};

export type Refugio = { id: string; nodo: string; nombre: string; capacidad: number };

export type Grafo = { version: string; nodos: Nodo[]; calles: Calle[]; refugios: Refugio[] };

// Estado en vivo, forma de GET /api/estado (AGENTS.md §5). Misma nota de copia temporal que arriba.
export type TipoZombie = "caminante" | "corredor" | "horda" | "dormido";
export type Zombie = { id: string; tipo: TipoZombie; nodo: string };

export type EstadoSobreviviente = "en_ruta" | "a_salvo" | "mordido";
export type Sobreviviente = {
  id: string;
  nodo: string;
  estado: EstadoSobreviviente;
  siguienteNodo?: string;
  // Opcional: lo llena el simulador con la misma función de rutas de shared/ (AGENTS.md §5).
  refugio?: string | null; // id del refugio de destino; null si no hay ruta segura
  callesRestantes?: number;
  // Flota de rescate (Pro): la camioneta en la que viaja esta persona, si hay alguna.
  vehiculo?: string;
};

// Flota de rescate (Pro): una camioneta con hasta 4 personas a bordo, que va hacia `destino` en este turno.
export type Vehiculo = { id: string; nodo: string; pasajeros: string[]; destino: string | null };

export type OcupacionRefugio = { id: string; ocupacion: number; capacidad: number };
export type Metricas = { vivos: number; aSalvo: number; mordidos: number; p95ms: number | null };

// De dónde viene el snapshot en pantalla. Todos los estados salvo en_vivo y reconectando muestran la simulación.
export type Conexion =
  | "simulado" // build local sin la API (NEXT_PUBLIC_USE_MOCKS sin definir)
  | "conectando" // esperando la primera respuesta de GET /api/estado
  | "en_vivo"
  | "reconectando" // falló el último poll: el último mundo real se mantiene unos turnos
  | "sin_partida" // la API responde, pero no hay ninguna partida en curso
  | "sin_conexion"; // la API falla o rompe el contrato

export type Snapshot = {
  turno: number;
  ronda: 1 | 2 | 3;
  zombies: Zombie[]; // solo los visibles: los dormidos nunca se envían
  aristasBloqueadas: string[];
  sobrevivientes: Sobreviviente[];
  vehiculos?: Vehiculo[]; // solo en rondas con flota de rescate
  refugios: OcupacionRefugio[];
  metricas: Metricas;
  generadoEn: string; // ISO 8601
};
