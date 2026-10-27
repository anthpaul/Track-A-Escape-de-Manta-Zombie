/**
 * DynamoDB key builders for the spookython_mundo single-table design.
 *
 * Every PK/SK in the codebase MUST go through these functions.
 * Never build key strings by hand — a typo here would be caught by tests;
 * a typo scattered across ten files would not.
 *
 * Key format reference: AGENTS.md §4.2 and docs/DYNAMODB_SCHEMA.txt
 *
 * CRITICAL — Turn SK padding:
 * DynamoDB sorts String keys lexicographically, not numerically.
 * Without padding: "TURNO#9" > "TURNO#20" > "TURNO#142"  ← WRONG
 * With padding:    "TURNO#000009" < "TURNO#000020" < "TURNO#000142"  ← correct
 * 6 digits supports up to 999 999 turns (~23 days at one turn per 2 s).
 */

const TURN_PAD = 6;
const padTurn = (n: number): string => String(n).padStart(TURN_PAD, "0");

export const KEYS = {
  /**
   * Game-turn item.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "TURNO#000142"
   *
   * Written twice per turn:
   *   Phase 1 — completo: false  (zombies moved, /paso not yet called)
   *   Phase 2 — completo: true   (siguienteNodo filled in, mordidas resolved)
   */
  turno: (partidaId: string, n: number) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `TURNO#${padTurn(n)}`,
  }),

  /**
   * Partition metadata item.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "METADATA"
   */
  metadata: (partidaId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: "METADATA",
  }),

  /**
   * Distributed lock — singleton item.
   *   PK: "CONTROL"
   *   SK: "PARTIDA_ACTIVA"
   *
   * POST /paso does not receive a partidaId (fixed contract), so the motor
   * reads this item to discover which partition is currently active.
   */
  control: () => ({
    PK: "CONTROL",
    SK: "PARTIDA_ACTIVA",
  }),

  /**
   * Refuge occupancy counter — one per refuge, Pro-tier only.
   *   PK: "PARTIDA#<partidaId>"
   *   SK: "REFUGIO#R-01"
   *
   * Written with UpdateItem ADD asignados 1 (atomic).
   * Condition: asignados < capacidad.
   */
  refugio: (partidaId: string, refugioId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `REFUGIO#${refugioId}`,
  }),

  /**
   * SK prefix helpers for Query operations.
   * Use with KeyConditionExpression begins_with(SK, :prefix).
   */
  prefixes: {
    turnos: "TURNO#",
    refugios: "REFUGIO#",
  },
} as const;

/** Returns an epoch-seconds TTL set to 24 hours from now. */
export const ttlManana = (): number => Math.floor(Date.now() / 1000) + 86_400;

/**
 * Generates a unique, sortable partition ID.
 * Format: "<modo>-r<ronda>-<epoch ms>"
 * Example: "evaluacion-r3-1793030400000"
 */
export const generarPartidaId = (
  modo: "evaluacion" | "demo",
  ronda: 1 | 2 | 3,
): string => `${modo}-r${ronda}-${Date.now()}`;

/** @internal — use KEYS.turno() in production code. */
export const _padTurn = padTurn;
