import { z } from "zod";
import type { Grafo, OcupacionRefugio, Snapshot, Sobreviviente } from "@/features/mapa/domain/tipos";

// Forma de GET /api/estado (AGENTS.md §5). Todo lo que llega de la red se valida aquí,
// para que el mapa nunca dibuje medio mundo a partir de un body que rompe el contrato.
const SobrevivienteSchema = z.object({
  id: z.string(),
  nodo: z.string(),
  estado: z.enum(["en_ruta", "a_salvo", "mordido"]),
  siguienteNodo: z.string().optional(),
  refugio: z.string().nullable().optional(),
  callesRestantes: z.number().int().nonnegative().optional(),
  vehiculo: z.string().optional(),
});

const VehiculoSchema = z.object({ id: z.string(), nodo: z.string(), pasajeros: z.array(z.string()), destino: z.string().nullable() });

const EstadoSchema = z.object({
  turno: z.number().int().nonnegative(),
  ronda: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  zombies: z.array(z.object({ id: z.string(), tipo: z.enum(["caminante", "corredor", "horda", "dormido"]), nodo: z.string() })),
  aristasBloqueadas: z.array(z.string()),
  sobrevivientes: z.array(SobrevivienteSchema),
  vehiculos: z.array(VehiculoSchema).optional(),
  // Opcional hasta que el simulador publique la ocupación de los refugios.
  refugios: z.array(z.object({ id: z.string(), ocupacion: z.number().int().nonnegative(), capacidad: z.number().int().nonnegative() })).optional(),
  metricas: z.object({
    vivos: z.number().int().nonnegative(),
    aSalvo: z.number().int().nonnegative(),
    mordidos: z.number().int().nonnegative(),
    p95ms: z.number().nonnegative().nullable(),
  }),
  generadoEn: z.string(),
});

// /estado responde 200 con este body cuando no hay ninguna partida en curso (backend/src/routes/estado.ts).
const SinPartidaSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) });

export type ResultadoEstado =
  | { tipo: "partida"; snapshot: Snapshot }
  | { tipo: "sinPartida"; codigo: string }
  | { tipo: "invalido" };

export function leerEstado(cuerpo: unknown, grafo: Grafo): ResultadoEstado {
  const sinPartida = SinPartidaSchema.safeParse(cuerpo);
  if (sinPartida.success) return { tipo: "sinPartida", codigo: sinPartida.data.error.code };

  const estado = EstadoSchema.safeParse(cuerpo);
  if (!estado.success) return { tipo: "invalido" };

  const { refugios, ...resto } = estado.data;
  return { tipo: "partida", snapshot: { ...resto, refugios: refugios ?? ocupacionPorLlegadas(grafo, resto.sobrevivientes) } };
}

// Un sobreviviente que llegó a un refugio se queda en su nodo, así que la ocupación se puede contar desde el snapshot.
function ocupacionPorLlegadas(grafo: Grafo, sobrevivientes: Sobreviviente[]): OcupacionRefugio[] {
  return grafo.refugios.map((refugio) => ({
    id: refugio.id,
    ocupacion: sobrevivientes.filter((s) => s.estado === "a_salvo" && s.nodo === refugio.nodo).length,
    capacidad: refugio.capacidad,
  }));
}
