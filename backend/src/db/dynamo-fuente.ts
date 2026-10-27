import { EstadoTurnoSchema } from "@abcstack/shared";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ErrorFuenteMundo, type FuenteMundo, type MundoTurno } from "../motor/fuente-mundo";
import { KEYS } from "./keys";

/** Minimal injectable read surface; DynamoDBDocumentClient satisfies this interface. */
export interface ClienteLecturaDynamo {
  send(command: GetCommand): Promise<{ Item?: unknown }>;
  send(command: QueryCommand): Promise<{ Items?: unknown[] }>;
}

interface OpcionesDynamoFuente {
  /** Epoch milliseconds; injectable to test expiration without sleeping. */
  ahora?: () => number;
  maxTurnosEnCache?: number;
}

const NumeroTurnoSchema = z.number().int().min(0).max(999_999);
const SolicitudSchema = z.object({ partidaId: z.string().min(1), turno: NumeroTurnoSchema });
const ItemTurnoSchema = z.object({
  PK: z.string(),
  SK: z.string().refine((key) => key.startsWith(KEYS.prefixes.turnos)
    && /^\d{6}$/.test(key.slice(KEYS.prefixes.turnos.length))),
  ttl: z.number().int().nonnegative(),
  data: EstadoTurnoSchema.pick({ zombies: true, aristasBloqueadas: true, completo: true }).extend({
    // Optional duplicated identity must agree with the authoritative keys, when present.
    partidaId: z.string().min(1).optional(),
    turno: NumeroTurnoSchema.optional(),
  }),
});

type EntradaCache = { mundo: MundoTurno; ttl: number };
const cacheKey = (partidaId: string, turno: number) => JSON.stringify([partidaId, turno]);

export class DynamoFuente implements FuenteMundo {
  private readonly cache = new Map<string, EntradaCache>();
  private readonly enVuelo = new Map<string, Promise<MundoTurno>>();
  private readonly ahora: () => number;
  private readonly maxTurnosEnCache: number;
  private readonly tableName: string;

  constructor(private readonly client: ClienteLecturaDynamo, tableName: string, options: OpcionesDynamoFuente = {}) {
    this.tableName = z.string().min(1).parse(tableName);
    this.ahora = options.ahora ?? Date.now;
    this.maxTurnosEnCache = z.number().int().positive().parse(options.maxTurnosEnCache ?? 32);
  }

  async obtenerTurno(partidaId: string, n: number): Promise<MundoTurno> {
    if (!SolicitudSchema.safeParse({ partidaId, turno: n }).success) {
      throw new ErrorFuenteMundo("INVALID_WORLD_REQUEST", "A game ID and a six-digit nonnegative integer turn are required");
    }
    const key = cacheKey(partidaId, n);
    const cached = this.cache.get(key);
    if (cached && cached.ttl > Math.floor(this.ahora() / 1000)) return cached.mundo;
    this.cache.delete(key);

    const pending = this.enVuelo.get(key);
    if (pending) return pending;
    const read = this.leerTurno(partidaId, n).finally(() => { this.enVuelo.delete(key); });
    this.enVuelo.set(key, read);
    return read;
  }

  private async leerTurno(partidaId: string, n: number): Promise<MundoTurno> {
    const requested = KEYS.turno(partidaId, n);
    const { Item } = await this.client.send(new GetCommand({
      TableName: this.tableName, Key: requested, ConsistentRead: true,
    }));
    let raw: unknown = Item;
    if (Item === undefined) {
      const { Items } = await this.client.send(new QueryCommand({
        TableName: this.tableName, ConsistentRead: true,
        KeyConditionExpression: "#pk = :pk AND #sk BETWEEN :first AND :requested",
        ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK" },
        ExpressionAttributeValues: {
          ":pk": requested.PK, ":first": KEYS.turno(partidaId, 0).SK, ":requested": requested.SK,
        },
        ScanIndexForward: false, Limit: 1,
      }));
      raw = Items?.[0];
      if (raw === undefined) throw new ErrorFuenteMundo("TURN_NOT_FOUND", "No published turn exists at or before the requested turn");
    }

    const parsed = ItemTurnoSchema.safeParse(raw);
    if (!parsed.success) throw new ErrorFuenteMundo("INVALID_WORLD_DATA", "World snapshot does not match the persistence contract");
    const item = parsed.data;
    const actualTurn = Number(item.SK.slice(KEYS.prefixes.turnos.length));
    if (item.PK !== requested.PK || actualTurn > n || (Item !== undefined && actualTurn !== n)
      || (item.data.partidaId !== undefined && item.data.partidaId !== partidaId)
      || (item.data.turno !== undefined && item.data.turno !== actualTurn)) {
      throw new ErrorFuenteMundo("INVALID_WORLD_DATA", "World snapshot identity does not match the requested game and turn");
    }
    if (item.ttl <= Math.floor(this.ahora() / 1000)) {
      throw new ErrorFuenteMundo("WORLD_EXPIRED", "World snapshot has expired");
    }
    const mundo: MundoTurno = Object.freeze({
      partidaId, turno: actualTurn,
      zombies: Object.freeze(item.data.zombies.map((zombie) => Object.freeze(zombie))),
      aristasBloqueadas: Object.freeze(item.data.aristasBloqueadas),
    });
    // Cache under the real turn, never alias an older fallback as the requested N.
    this.cache.set(cacheKey(partidaId, actualTurn), { mundo, ttl: item.ttl });
    if (this.cache.size > this.maxTurnosEnCache) this.cache.delete(this.cache.keys().next().value!);
    return mundo;
  }
}
