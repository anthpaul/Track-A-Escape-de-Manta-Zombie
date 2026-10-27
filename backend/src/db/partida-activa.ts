/**
 * Active partition resolver (AGENTS.md §4.5).
 *
 * POST /paso does not receive a partidaId — the contract is fixed.
 * The motor discovers the active partition by reading the distributed lock
 * item CONTROL / PARTIDA_ACTIVA written by the simulator.
 *
 * Caching rules (AGENTS.md §4.5):
 *   - The lock is cached for at most 1 second.
 *   - If the incoming `turno` is <= the last known turno for this partidaId,
 *     the lock is re-read — a new partition may have started.
 *   - If DynamoDB is unavailable, we re-throw; /paso must return the safe
 *     fallback (nodoActual) rather than routing blind.
 */

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { KEYS } from "./keys";

// ---------------------------------------------------------------------------
// Minimal DynamoDB read surface (same pattern as DynamoFuente)
// ---------------------------------------------------------------------------

export interface ClienteLecturaPartida {
  send(command: GetCommand): Promise<{ Item?: unknown }>;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CandadoSchema = z.object({
  PK: z.literal("CONTROL"),
  SK: z.literal("PARTIDA_ACTIVA"),
  partidaId: z.string().min(1),
  turnoActual: z.number().int().nonnegative(),
  expiraEn: z.number().int().positive(),
  modo: z.enum(["evaluacion", "demo"]),
});

export type Candado = z.infer<typeof CandadoSchema>;

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

interface CacheEntry {
  candado: Candado;
  /** Epoch ms when the entry was stored. */
  cachedAt: number;
}

const CACHE_TTL_MS = 1_000;

export class PartidaActivaResolver {
  private cache: CacheEntry | null = null;
  private readonly ahora: () => number;

  constructor(
    private readonly client: ClienteLecturaPartida,
    private readonly tableName: string,
    options: { ahora?: () => number } = {},
  ) {
    this.ahora = options.ahora ?? Date.now;
  }

  /**
   * Return the active partition ID.
   *
   * Re-reads DynamoDB when:
   *   - Cache is empty or older than 1 s.
   *   - The incoming turno <= last known turnoActual (new partition may have started).
   *
   * Throws when no active partition exists or the item is malformed.
   */
  async resolverPartidaId(turnoSolicitado: number): Promise<string> {
    const now = this.ahora();

    const cacheValid =
      this.cache !== null &&
      now - this.cache.cachedAt < CACHE_TTL_MS &&
      turnoSolicitado > this.cache.candado.turnoActual;

    if (cacheValid) return this.cache!.candado.partidaId;

    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: KEYS.control(),
        ConsistentRead: true,
      }),
    );

    if (Item === undefined) {
      throw new ErrorPartidaActiva("NO_ACTIVE_PARTITION", "No active partition found");
    }

    const parsed = CandadoSchema.safeParse(Item);
    if (!parsed.success) {
      throw new ErrorPartidaActiva("INVALID_LOCK_ITEM", "Active partition lock item is malformed");
    }

    const candado = parsed.data;

    // The lock itself carries an expiraEn TTL (epoch s).
    if (candado.expiraEn <= Math.floor(now / 1000)) {
      throw new ErrorPartidaActiva("LOCK_EXPIRED", "Active partition lock has expired");
    }

    this.cache = { candado, cachedAt: now };
    return candado.partidaId;
  }
}

// ---------------------------------------------------------------------------
// Domain error
// ---------------------------------------------------------------------------

type CodigoErrorPartida =
  | "NO_ACTIVE_PARTITION"
  | "INVALID_LOCK_ITEM"
  | "LOCK_EXPIRED";

export class ErrorPartidaActiva extends Error {
  constructor(
    readonly code: CodigoErrorPartida,
    message: string,
  ) {
    super(message);
    this.name = "ErrorPartidaActiva";
  }
}
