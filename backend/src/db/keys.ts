/**
 * DynamoDB key builders for the spookython_mundo single-table design.
 *
 * Every PK/SK in the codebase MUST go through these functions.
 * Never build key strings by hand — a typo here would be caught by tests;
 * a typo scattered across ten files would not.
 *
 * Key format reference: AGENTS.md §4.2 and docs/DYNAMODB_SCHEMA.txt
 */

// ---------------------------------------------------------------------------
// Turn SK padding
// ---------------------------------------------------------------------------
// DynamoDB sorts String keys lexicographically, not numerically.
// Without padding: "TURNO#9" > "TURNO#20" > "TURNO#142"  ← WRONG
// With padding:    "TURNO#000009" < "TURNO#000020" < "TURNO#000142"  ← correct
//
// 6 digits supports up to 999 999 turns.
// At one turn every 2 s that is ~23 days of continuous simulation.
const TURN_PAD = 6;

const padTurn = (n: number): string => String(n).padStart(TURN_PAD, "0");

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

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
   *
   * Holds ronda, estado, modo, semilla, config, turnoActual, iniciadoEn.
   * Written by the simulator on start and updated on finish.
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
   * The simulator holds it while a round is running and renews it every turn
   * (+30 s). If the Lambda dies, expiraEn acts as a TTL for the lock.
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
   * Condition: asignados < capacidad. If it fails, the refuge is full.
   */
  refugio: (partidaId: string, refugioId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `REFUGIO#${refugioId}`,
  }),

  /**
   * SK prefix helpers for Query operations.
   * Use with KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)"
   */
  prefixes: {
    turnos: "TURNO#",
    refugios: "REFUGIO#",
  },
} as const;

// ---------------------------------------------------------------------------
// TTL helper
// ---------------------------------------------------------------------------

/**
 * Returns an epoch-seconds TTL set to 24 hours from now.
 * DynamoDB deletes the item automatically after this timestamp.
 * All items in the table carry a `ttl` field with this value (AGENTS.md §4.2).
 */
export const ttlManana = (): number => Math.floor(Date.now() / 1000) + 86_400;

// ---------------------------------------------------------------------------
// Partition ID generator
// ---------------------------------------------------------------------------

/**
 * Generates a unique, sortable partition ID.
 * Format: "<modo>-r<ronda>-<epoch ms>"
 * Example: "evaluacion-r3-1793030400000"
 *
 * The epoch suffix makes it sortable by start time and unique enough
 * for a hackathon (one round at a time, enforced by the CONTROL lock).
 */
export const generarPartidaId = (
  modo: "evaluacion" | "demo",
  ronda: 1 | 2 | 3
): string => `${modo}-r${ronda}-${Date.now()}`;

// ---------------------------------------------------------------------------
// Internal helpers exposed for tests only
// ---------------------------------------------------------------------------

/** @internal — use KEYS.turno() in production code. */
export const _padTurn = padTurn;
