/**
 * DynamoDB key builders for the spookython_mundo single-table design.
 *
 * Every PK/SK MUST go through these functions — never build key strings by hand.
 * Key format reference: AGENTS.md §4.2 and docs/DYNAMODB_SCHEMA.txt
 *
 * CRITICAL: Turn SKs use 6-digit zero-padded numbers.
 * Without padding "TURNO#9" sorts AFTER "TURNO#20" lexicographically — wrong.
 * With padding  "TURNO#000009" sorts BEFORE "TURNO#000020" — correct.
 */

const TURN_PAD = 6;
const padTurn = (n: number): string => String(n).padStart(TURN_PAD, "0");

export const KEYS = {
  turno: (partidaId: string, n: number) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `TURNO#${padTurn(n)}`,
  }),
  metadata: (partidaId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: "METADATA",
  }),
  control: () => ({
    PK: "CONTROL",
    SK: "PARTIDA_ACTIVA",
  }),
  refugio: (partidaId: string, refugioId: string) => ({
    PK: `PARTIDA#${partidaId}`,
    SK: `REFUGIO#${refugioId}`,
  }),
  prefixes: {
    turnos: "TURNO#",
    refugios: "REFUGIO#",
  },
} as const;

export const ttlManana = (): number => Math.floor(Date.now() / 1000) + 86_400;

export const generarPartidaId = (
  modo: "evaluacion" | "demo",
  ronda: 1 | 2 | 3,
): string => `${modo}-r${ronda}-${Date.now()}`;

/** @internal — exposed for tests only */
export const _padTurn = padTurn;
