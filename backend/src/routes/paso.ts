/** POST /api/paso: one production handler, also used by dependency-injected tests. */
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { PasoInputSchema, PasoOutputSchema } from "@abcstack/shared";
import { DynamoFuente } from "../db/dynamo-fuente";
import { PartidaActivaResolver } from "../db/partida-activa";
import type { FuenteMundo, MundoTurno } from "../motor/fuente-mundo";
import { calcularSiguienteNodo, calcularPeligrosDelTurno, contextoGrafo } from "../motor/motor";

export interface OpcionesRutaPaso {
  fuente: FuenteMundo;
  resolver: Pick<PartidaActivaResolver, "resolverPartidaId">;
  apiKey: string | (() => string);
  budgetMs?: number;
  calcularPaso?: typeof calcularSiguienteNodo;
}

function comparacionTiempoConstante(provided: string, expected: string): boolean {
  // Fixed-length digests cover the complete key, including suffixes beyond byte 256.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

async function conPresupuesto<T>(promise: Promise<T>, budgetMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), budgetMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Never invent an empty world: without a snapshot, staying put is the only valid fallback. */
function pasoDeRespaldo(nodoActual: string, mundo: MundoTurno | undefined): string {
  if (!mundo) return nodoActual;
  const peligros = calcularPeligrosDelTurno(mundo, contextoGrafo.indexado);
  if (!peligros.nodosProhibidos.has(nodoActual)) return nodoActual;
  const candidatos = contextoGrafo.indexado.vecinos(nodoActual).filter((nodo) =>
    contextoGrafo.indexado.esMovimientoValido(nodoActual, nodo, mundo.aristasBloqueadas)
    && !peligros.nodosProhibidos.has(nodo)
    && !peligros.aristasCrucePeligroso.has(`${nodoActual}|${nodo}`),
  );
  const distanciaRefugio = (nodo: string): number => {
    const coord = contextoGrafo.coordenadas.get(nodo)!;
    return Math.min(...contextoGrafo.refugios.map((refugio) => {
      const destino = contextoGrafo.coordenadas.get(refugio.nodo)!;
      return (coord.lat - destino.lat) ** 2 + (coord.lng - destino.lng) ** 2;
    }));
  };
  return candidatos.sort((a, b) => distanciaRefugio(a) - distanciaRefugio(b))[0] ?? nodoActual;
}

export function crearRutaPaso(opts: OpcionesRutaPaso): Hono {
  const ruta = new Hono();
  ruta.post("/", async (c) => {
    c.header("Cache-Control", "no-store");
    const apiKey = typeof opts.apiKey === "function" ? opts.apiKey() : opts.apiKey;
    const providedKey = c.req.header("x-api-key") ?? "";
    if (!apiKey || !comparacionTiempoConstante(providedKey, apiKey)) {
      return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing x-api-key" } }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Request body must be valid JSON" } }, 400);
    }
    const parsed = PasoInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid body", details: parsed.error.flatten() } }, 400);
    }
    const { sobrevivienteId, nodoActual, turno } = parsed.data;
    let mundoDisponible: MundoTurno | undefined;
    const work = async (): Promise<string> => {
      const partidaId = await opts.resolver.resolverPartidaId(turno);
      const mundo = await opts.fuente.obtenerTurno(partidaId, turno);
      mundoDisponible = mundo;
      const peligros = calcularPeligrosDelTurno(mundo, contextoGrafo.indexado);
      return (opts.calcularPaso ?? calcularSiguienteNodo)(
        { sobrevivienteId, nodoActual, mundo }, peligros,
      ).siguienteNodo;
    };
    let siguienteNodo: string | undefined;
    try {
      siguienteNodo = await conPresupuesto(work(), opts.budgetMs ?? 300);
    } catch {
      // Absent games, world read failures and motor errors share a valid fallback.
      // Never log the API key, request or raw provider error.
    }
    const valido = siguienteNodo !== undefined && mundoDisponible !== undefined
      && PasoOutputSchema.safeParse({ siguienteNodo }).success
      && contextoGrafo.indexado.esMovimientoValido(nodoActual, siguienteNodo, mundoDisponible.aristasBloqueadas);
    return c.json({ siguienteNodo: valido ? siguienteNodo : pasoDeRespaldo(nodoActual, mundoDisponible) });
  });
  return ruta;
}

// Read clients and the static graph are reused per warm instance; no request writes.
const dynamo = DynamoDBDocument.from(new DynamoDB({ region: process.env.AWS_REGION ?? "us-east-2" }));
const table = process.env.DDB_TABLE ?? "spookython_mundo";
export const rutaPaso = crearRutaPaso({
  fuente: new DynamoFuente(dynamo, table),
  resolver: new PartidaActivaResolver(dynamo, table),
  apiKey: () => process.env.API_KEY ?? "",
});
