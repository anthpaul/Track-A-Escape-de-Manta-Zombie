/**
 * Repositorio de solo lectura para GET /estado.
 *
 * Lee dos ítems de DynamoDB:
 *   1. CONTROL / PARTIDA_ACTIVA: qué partida está en curso.
 *   2. PARTIDA#<id> / TURNO#<último completo>: el turno terminado más reciente.
 *
 * Está separado a propósito de DynamoFuente (que atiende al motor).
 * El motor necesita cualquier turno, rápido; /estado necesita solo el ÚLTIMO turno COMPLETO.
 *
 * Referencias: AGENTS.md §4.2, §4.5, §5
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
// Interfaz de cliente inyectable (igual que en DynamoFuente: evita importar el
// DynamoDBDocumentClient completo en los tests)
// ---------------------------------------------------------------------------

export interface ClienteLectura {
  send(command: GetCommand): Promise<{ Item?: unknown }>;
  send(command: QueryCommand): Promise<{ Items?: unknown[] }>;
}

// ---------------------------------------------------------------------------
// Schemas de los dos ítems de DynamoDB que se leen
// ---------------------------------------------------------------------------

/** Ítem CONTROL / PARTIDA_ACTIVA */
const CandadoSchema = z.object({
  PK: z.literal("CONTROL"),
  SK: z.literal("PARTIDA_ACTIVA"),
  partidaId: z.string().min(1),
  modo: z.enum(["evaluacion", "demo"]),
  turnoActual: z.number().int().nonnegative(),
  expiraEn: z.number().int().positive(),
});

/** Subconjunto de TURNO#N que /estado expone públicamente */
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
// Tipo de salida pública (coincide con la respuesta de GET /estado en AGENTS.md §5)
// ---------------------------------------------------------------------------

export interface RespuestaEstado {
  turno: number;
  ronda: 1 | 2 | 3;
  zombies: EstadoTurno["zombies"];
  aristasBloqueadas: string[];
  sobrevivientes: Sobreviviente[];
  /** Flota de rescate (Pro): las camionetas del turno, solo en rondas con flota. */
  vehiculos?: NonNullable<EstadoTurno["vehiculos"]>;
  metricas: {
    vivos: number;
    aSalvo: number;
    mordidos: number;
    /** p95 de las latencias de POST /paso de la ronda hasta ahora, tomado del turno; null si nadie midió /paso. */
    p95ms: number | null;
  };
  generadoEn: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// Tipo de error
// ---------------------------------------------------------------------------

type CodigoErrorEstado = "SIN_PARTIDA_ACTIVA" | "PARTIDA_EXPIRADA" | "SIN_TURNO_COMPLETO" | "DATOS_INVALIDOS";

export class ErrorEstado extends Error {
  constructor(readonly code: CodigoErrorEstado, message: string) {
    super(message);
    this.name = "ErrorEstado";
  }
}

// ---------------------------------------------------------------------------
// Repositorio
// ---------------------------------------------------------------------------

export class EstadoRepo {
  constructor(
    private readonly client: ClienteLectura,
    private readonly tableName: string,
    private readonly ahora: () => number = Date.now,
  ) {}

  /**
   * Devuelve el estado actual del mundo para GET /estado.
   *
   * Secuencia:
   *   1. Leer CONTROL / PARTIDA_ACTIVA para descubrir la partida activa.
   *   2. Verificar que el candado no haya expirado.
   *   3. Consultar el último TURNO con completo = true.
   *   4. Armar la respuesta.
   *
   * Lanza ErrorEstado en todas las fallas esperadas para que la ruta pueda
   * responder un 200 limpio con cuerpo de error en lugar de un 500.
   */
  async obtenerEstado(): Promise<RespuestaEstado> {
    // Paso 1: leer el candado de la partida activa.
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

    // Paso 2: verificar que el candado no haya expirado.
    const ahoraSegundos = Math.floor(this.ahora() / 1000);
    if (candado.data.expiraEn <= ahoraSegundos) {
      throw new ErrorEstado("PARTIDA_EXPIRADA", "Active-game lock has expired — no game is running");
    }

    const { partidaId } = candado.data;

    // Paso 3: obtener el último turno completo.
    // Query con PK = PARTIDA#<id> y SK entre TURNO#000000 y TURNO#999999,
    // en orden descendente con límite 1 → último turno escrito.
    // El filtro completo = true se aplica en la aplicación, porque en DynamoDB
    // una condición sobre la sort key combinada con un FilterExpression no es
    // eficiente; como los turnos se escriben rápido (<2 s), el primer resultado
    // casi siempre está completo. Si no, se reintenta una vez con límite 5.
    const turnoCompleto = await this.leerUltimoTurnoCompleto(partidaId);

    if (!turnoCompleto) {
      throw new ErrorEstado("SIN_TURNO_COMPLETO", "No complete turn available yet for this game");
    }

    // El simulador ya excluye a los dormidos al escribir EstadoTurnoSchema
    // (ZombieVisibleSchema solo admite caminante/corredor/horda). Se convierte directamente.
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
        p95ms: turnoCompleto.p95ms ?? null,  // lo guarda el simulador HTTP; /estado solo lo reenvía
      },
      generadoEn: new Date(this.ahora()).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Funciones auxiliares privadas
  // ---------------------------------------------------------------------------

  private async leerUltimoTurnoCompleto(
    partidaId: string,
  ): Promise<z.infer<typeof ItemTurnoEstadoSchema> | null> {
    // Revisa hasta 5 turnos recientes para encontrar uno con completo = true.
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
