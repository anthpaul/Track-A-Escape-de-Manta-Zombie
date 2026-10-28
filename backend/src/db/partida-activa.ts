/**
 * Resolución de la partición activa (AGENTS.md §4.5).
 *
 * POST /paso no recibe un partidaId: el contrato es fijo.
 * El motor descubre la partición activa leyendo el ítem de candado distribuido
 * CONTROL / PARTIDA_ACTIVA que escribe el simulador.
 *
 * Reglas de cache (AGENTS.md §4.5):
 *   - El candado se cachea como máximo 1 segundo.
 *   - Si el `turno` entrante es <= al último turno conocido de este partidaId,
 *     se vuelve a leer el candado: puede haber empezado una partición nueva.
 *   - Si DynamoDB no está disponible, se relanza el error; /paso debe responder
 *     el fallback seguro (nodoActual) en lugar de rutear a ciegas.
 */

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { KEYS } from "./keys";

// ---------------------------------------------------------------------------
// Superficie mínima de lectura de DynamoDB (mismo patrón que DynamoFuente)
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
// Resolución
// ---------------------------------------------------------------------------

interface CacheEntry {
  candado: Candado;
  /** Epoch en ms en que se guardó la entrada. */
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
   * Devuelve el ID de la partición activa.
   *
   * Vuelve a leer DynamoDB cuando:
   *   - La cache está vacía o tiene más de 1 s.
   *   - El turno entrante es <= al último turnoActual conocido (puede haber empezado una partición nueva).
   *
   * Lanza un error si no hay partición activa o si el ítem está mal formado.
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

    // El propio candado lleva un TTL expiraEn (epoch en segundos).
    if (candado.expiraEn <= Math.floor(now / 1000)) {
      throw new ErrorPartidaActiva("LOCK_EXPIRED", "Active partition lock has expired");
    }

    this.cache = { candado, cachedAt: now };
    return candado.partidaId;
  }
}

// ---------------------------------------------------------------------------
// Error de dominio
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
