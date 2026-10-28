/**
 * Read-only repository for GET /estado.
 *
 * Reads two items from DynamoDB:
 *   1. CONTROL / PARTIDA_ACTIVA — which game is currently running.
 *   2. PARTIDA#<id> / TURNO#<last complete> — the most recent finished turn.
 *
 * This is intentionally separate from DynamoFuente (which serves the motor).
 * The motor needs any turn fast; /estado needs the LAST COMPLETE turn only.
 *
 * References: AGENTS.md §4.2, §4.5, §5
 */
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import {
  EstadoTurnoSchema,
  type EstadoTurno,
  type Sobreviviente,
} from "@abcstack/shared";
import { KEYS } from "./keys";

// ---------------------------------------------------------------------------
// Injectable client interface (same as DynamoFuente — avoids importing the
// full DynamoDBDocumentClient in tests)
// ---------------------------------------------------------------------------

export interface ClienteLectura {
  send(command: GetCommand): Promise<{ Item?: unknown }>;
  send(command: QueryCommand): Promise<{ Items?: unknown[] }>;
}

// ---------------------------------------------------------------------------
// Schemas for the two DynamoDB items we read
// ---------------------------------------------------------------------------

/** CONTROL / PARTIDA_ACTIVA item */
const CandadoSchema = z.object({
  PK: z.literal("CONTROL"),
  SK: z.literal("PARTIDA_ACTIVA"),
  partidaId: z.string().min(1),
  modo: z.enum(["evaluacion", "demo"]),
  turnoActual: z.number().int().nonnegative(),
  expiraEn: z.number().int().positive(),
});

/** Subset of TURNO#N that /estado exposes publicly */
const ItemTurnoEstadoSchema = EstadoTurnoSchema.pick({
  ronda: true,
  turno: true,
  zombies: true,
  aristasBloqueadas: true,
  sobrevivientes: true,
  completo: true,
  p95ms: true,
  vehiculos: true,
});

// ---------------------------------------------------------------------------
// Public output type (matches AGENTS.md §5 GET /estado response)
// ---------------------------------------------------------------------------

export interface RespuestaEstado {
  turno: number;
  ronda: 1 | 2 | 3;
  zombies: EstadoTurno["zombies"];
  aristasBloqueadas: string[];
  sobrevivientes: Sobreviviente[];
  /** Rescue fleet (Pro): the vans of the turn, only in rounds with a fleet. */
  vehiculos?: NonNullable<EstadoTurno["vehiculos"]>;
  metricas: {
    vivos: number;
    aSalvo: number;
    mordidos: number;
    /** p95 of the round's POST /paso latencies so far, from the turn; null when nothing measured /paso. */
    p95ms: number | null;
  };
  generadoEn: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

type CodigoErrorEstado = "SIN_PARTIDA_ACTIVA" | "PARTIDA_EXPIRADA" | "SIN_TURNO_COMPLETO" | "DATOS_INVALIDOS";

export class ErrorEstado extends Error {
  constructor(readonly code: CodigoErrorEstado, message: string) {
    super(message);
    this.name = "ErrorEstado";
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class EstadoRepo {
  constructor(
    private readonly client: ClienteLectura,
    private readonly tableName: string,
    private readonly ahora: () => number = Date.now,
  ) {}

  /**
   * Return the current world state for GET /estado.
   *
   * Sequence:
   *   1. Read CONTROL / PARTIDA_ACTIVA to discover the active game.
   *   2. Verify the lock has not expired.
   *   3. Query the last TURNO with completo = true.
   *   4. Shape the response.
   *
   * Throws ErrorEstado for all expected failure modes so the route can return
   * a clean 200 with an error body rather than a 500.
   */
  async obtenerEstado(): Promise<RespuestaEstado> {
    // Step 1: read the active-game lock.
    const { Item: rawCandado } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: KEYS.control(),
        ConsistentRead: true,
      }),
    );

    if (rawCandado === undefined) {
      throw new ErrorEstado("SIN_PARTIDA_ACTIVA", "No active game at the moment");
    }

    const candado = CandadoSchema.safeParse(rawCandado);
    if (!candado.success) {
      throw new ErrorEstado("DATOS_INVALIDOS", "Active-game lock is malformed");
    }

    // Step 2: verify the lock has not expired.
    const ahoraSegundos = Math.floor(this.ahora() / 1000);
    if (candado.data.expiraEn <= ahoraSegundos) {
      throw new ErrorEstado("PARTIDA_EXPIRADA", "Active-game lock has expired — no game is running");
    }

    const { partidaId } = candado.data;

    // Step 3: get the last complete turn.
    // Query PK = PARTIDA#<id>, SK between TURNO#000000 and TURNO#999999,
    // sorted descending, limit 1 → last written turn.
    // We filter for completo = true in the application layer because DynamoDB
    // FilterExpression cannot use a sort-key condition AND a filter at the same
    // time efficiently; since turns are written quickly (<2 s), the first result
    // is almost always complete. We retry once with limit 5 if not.
    const turnoCompleto = await this.leerUltimoTurnoCompleto(partidaId);

    if (!turnoCompleto) {
      throw new ErrorEstado("SIN_TURNO_COMPLETO", "No complete turn available yet for this game");
    }

    // The simulator already excludes dormidos when writing EstadoTurnoSchema
    // (ZombieVisibleSchema only allows caminante/corredor/horda). We cast directly.
    const zombiesVisibles = turnoCompleto.zombies as EstadoTurno["zombies"];

    const vivos = turnoCompleto.sobrevivientes.filter((s) => s.estado === "en_ruta").length;
    const aSalvo = turnoCompleto.sobrevivientes.filter((s) => s.estado === "a_salvo").length;
    const mordidos = turnoCompleto.sobrevivientes.filter((s) => s.estado === "mordido").length;

    return {
      turno: turnoCompleto.turno,
      ronda: turnoCompleto.ronda,
      zombies: zombiesVisibles,
      aristasBloqueadas: turnoCompleto.aristasBloqueadas,
      sobrevivientes: turnoCompleto.sobrevivientes,
      ...(turnoCompleto.vehiculos && { vehiculos: turnoCompleto.vehiculos }),
      metricas: {
        vivos,
        aSalvo,
        mordidos,
        p95ms: turnoCompleto.p95ms ?? null,  // stored by the HTTP simulator; /estado just relays it
      },
      generadoEn: new Date(this.ahora()).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async leerUltimoTurnoCompleto(
    partidaId: string,
  ): Promise<z.infer<typeof ItemTurnoEstadoSchema> | null> {
    // Try up to 5 recent turns to find one with completo = true.
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        ConsistentRead: true,
        KeyConditionExpression: "#pk = :pk AND #sk BETWEEN :first AND :last",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": `PARTIDA#${partidaId}`,
          ":first": KEYS.turno(partidaId, 0).SK,
          ":last": KEYS.turno(partidaId, 999_999).SK,
        },
        ScanIndexForward: false,
        Limit: 5,
      }),
    );

    for (const raw of Items ?? []) {
      const parsed = ItemTurnoEstadoSchema.safeParse((raw as { data?: unknown })?.data ?? raw);
      if (parsed.success && parsed.data.completo) return parsed.data;
    }

    return null;
  }
}
