/**
 * Constructores de claves de DynamoDB para el diseño single-table de spookython_mundo.
 *
 * Toda PK/SK del código DEBE pasar por estas funciones.
 * Nunca se arman las claves a mano: un error de tipeo acá lo detectan los tests;
 * uno repartido en diez archivos, no.
 *
 * Referencia del formato de claves: AGENTS.md §4.2 y docs/DYNAMODB_SCHEMA.txt
 *
 * CRÍTICO: relleno con ceros de la SK del turno.
 * DynamoDB ordena las claves String de forma lexicográfica, no numérica.
 * Sin relleno: "TURNO#9" > "TURNO#20" > "TURNO#142"  ← INCORRECTO
 * Con relleno: "TURNO#000009" < "TURNO#000020" < "TURNO#000142"  ← correcto
 * 6 dígitos alcanzan para 999 999 turnos (~23 días a un turno cada 2 s).
 */

const TURN_PAD = 6;
const padTurn = (n: number): string => String(n).padStart(TURN_PAD, "0");

export const KEYS = {
  /**
   * Ítem de turno de una partida.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "TURNO#000142"
   *
   * Se escribe dos veces por turno:
   *   Fase 1: completo: false  (zombies movidos, todavía sin llamar a /paso)
   *   Fase 2: completo: true   (siguienteNodo cargado, mordidas resueltas)
   */
  turno: (partidaId: string, n: number) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `TURNO#${padTurn(n)}`,
  }),

  /**
   * Ítem de metadatos de la partición.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "METADATA"
   */
  metadata: (partidaId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: "METADATA",
  }),

  /**
   * Candado distribuido: ítem único.
   *   PK: "CONTROL"
   *   SK: "PARTIDA_ACTIVA"
   *
   * POST /paso no recibe un partidaId (el contrato es fijo), así que el motor
   * lee este ítem para descubrir qué partición está activa.
   */
  control: () => ({
    PK: "CONTROL",
    SK: "PARTIDA_ACTIVA",
  }),

  /**
   * Contador de ocupación de refugio: uno por refugio, solo en el nivel Pro.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "REFUGIO#R-01"
   *
   * Se escribe con UpdateItem ADD asignados 1 (atómico).
   * Condición: asignados < capacidad.
   */
  refugio: (partidaId: string, refugioId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `REFUGIO#${refugioId}`,
  }),

  /**
   * Prefijos de SK para operaciones Query.
   * Se usan con KeyConditionExpression begins_with(SK, :prefix).
   */
  prefixes: {
    turnos: "TURNO#",
    refugios: "REFUGIO#",
  },
} as const;

/** Devuelve un TTL en segundos epoch, fijado a 24 horas desde ahora. */
export const ttlManana = (): number => Math.floor(Date.now() / 1000) + 86_400;

/**
 * Genera un ID de partición único y ordenable.
 * Formato: "<modo>-r<ronda>-<epoch ms>"
 * Ejemplo: "evaluacion-r3-1793030400000"
 */
export const generarPartidaId = (
  modo: "evaluacion" | "demo",
  ronda: 1 | 2 | 3,
): string => `${modo}-r${ronda}-${Date.now()}`;

/** @internal En código de producción, usar KEYS.turno(). */
export const _padTurn = padTurn;
