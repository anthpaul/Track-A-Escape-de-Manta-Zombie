import { z } from "zod";

// Keep the official /paso validators compatible with the original package exports.
export const NodoIdSchema = z.string().regex(/^N-\d{4}$/);
export const SobrevivienteIdSchema = z.string().regex(/^S-\d{4}$/);
export const CalleIdSchema = z.string().regex(/^C-\d{4}$/);
export const RefugioIdSchema = z.string().regex(/^R-\d{2}$/);

export const PasoInputSchema = z.object({
  sobrevivienteId: SobrevivienteIdSchema,
  nodoActual: NodoIdSchema,
  turno: z.number().int().nonnegative(),
});
export const PasoOutputSchema = z.object({ siguienteNodo: NodoIdSchema });

export const BarrioSchema = z.enum(["tarqui", "los_esteros", "barbasquillo", "jocay"]);
export const TipoCalleSchema = z.enum(["avenida", "calle", "callejon", "puente"]);
const LatitudSchema = z.number().finite().min(-90).max(90);
const LongitudSchema = z.number().finite().min(-180).max(180);
const CoordenadaSchema = z.tuple([LongitudSchema, LatitudSchema]);

export const NodoSchema = z.object({
  id: NodoIdSchema,
  lat: LatitudSchema,
  lng: LongitudSchema,
  barrio: BarrioSchema.optional(),
});
export const CalleSchema = z.object({
  id: CalleIdSchema,
  desde: NodoIdSchema,
  hasta: NodoIdSchema,
  distancia_m: z.number().finite().positive(),
  tipo: TipoCalleSchema,
  geometria: z.array(CoordenadaSchema).min(2),
});
export const RefugioSchema = z.object({
  id: RefugioIdSchema,
  nodo: NodoIdSchema,
  nombre: z.string().min(1),
  capacidad: z.number().int().nonnegative(),
});

export const GrafoSchema = z.object({
  version: z.string().min(1),
  nodos: z.array(NodoSchema),
  calles: z.array(CalleSchema),
  refugios: z.array(RefugioSchema),
}).superRefine((graph, ctx) => {
  for (const collection of ["nodos", "calles", "refugios"] as const) {
    const ids = new Set<string>();
    graph[collection].forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: "custom", path: [collection, index, "id"], message: "Duplicate ID" });
      }
      ids.add(item.id);
    });
  }

  const nodes = new Map(graph.nodos.map((node) => [node.id, node]));
  const pairs = new Set<string>();
  graph.calles.forEach((street, index) => {
    if (street.desde === street.hasta) {
      ctx.addIssue({ code: "custom", path: ["calles", index], message: "Self loops are not allowed" });
    }
    const pair = [street.desde, street.hasta].sort().join("|");
    if (pairs.has(pair)) {
      ctx.addIssue({ code: "custom", path: ["calles", index], message: "Parallel streets are not allowed" });
    }
    pairs.add(pair);

    for (const endpoint of ["desde", "hasta"] as const) {
      const node = nodes.get(street[endpoint]);
      const point = endpoint === "desde" ? street.geometria[0] : street.geometria.at(-1);
      if (!node) {
        ctx.addIssue({ code: "custom", path: ["calles", index, endpoint], message: "Unknown node" });
      } else if (point?.[0] !== node.lng || point?.[1] !== node.lat) {
        ctx.addIssue({ code: "custom", path: ["calles", index, "geometria"],
          message: "Geometry endpoints must exactly match their nodes in [lng, lat] order" });
      }
    }
  });
  graph.refugios.forEach((shelter, index) => {
    if (!nodes.has(shelter.nodo)) {
      ctx.addIssue({ code: "custom", path: ["refugios", index, "nodo"], message: "Unknown node" });
    }
  });
});

export const TipoZombieSchema = z.enum(["caminante", "corredor", "horda", "dormido"]);
export const ZombieSchema = z.object({
  id: z.string().min(1),
  tipo: TipoZombieSchema,
  nodo: NodoIdSchema,
});
export const EstadoSobrevivienteSchema = z.enum(["en_ruta", "a_salvo", "mordido"]);
export const SobrevivienteSchema = z.object({
  id: SobrevivienteIdSchema,
  nodo: NodoIdSchema,
  estado: EstadoSobrevivienteSchema,
  siguienteNodo: NodoIdSchema.optional(),
  refugio: RefugioIdSchema.nullable().optional(),
  callesRestantes: z.number().int().nonnegative().optional(),
});

// Shared snapshots contain visible zombies only, never sleeping zombies.
const ZombieVisibleSchema = ZombieSchema.extend({ tipo: z.enum(["caminante", "corredor", "horda"]) });
export const EstadoTurnoSchema = z.object({
  partidaId: z.string().min(1),
  ronda: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  turno: z.number().int().nonnegative(),
  completo: z.boolean(),
  zombies: z.array(ZombieVisibleSchema),
  aristasBloqueadas: z.array(CalleIdSchema),
  sobrevivientes: z.array(SobrevivienteSchema),
  // p95 of every POST /paso latency of the round so far, written by the HTTP simulator when it
  // completes the turn; absent or null when nothing measured /paso (in-process demo rounds).
  p95ms: z.number().nonnegative().nullable().optional(),
});

export type PasoInput = z.infer<typeof PasoInputSchema>;
export type PasoOutput = z.infer<typeof PasoOutputSchema>;
export type Barrio = z.infer<typeof BarrioSchema>;
export type TipoCalle = z.infer<typeof TipoCalleSchema>;
export type Nodo = z.infer<typeof NodoSchema>;
export type Calle = z.infer<typeof CalleSchema>;
export type Refugio = z.infer<typeof RefugioSchema>;
export type Grafo = z.infer<typeof GrafoSchema>;
export type TipoZombie = z.infer<typeof TipoZombieSchema>;
export type Zombie = z.infer<typeof ZombieSchema>;
export type EstadoSobreviviente = z.infer<typeof EstadoSobrevivienteSchema>;
export type Sobreviviente = z.infer<typeof SobrevivienteSchema>;
export type EstadoTurno = z.infer<typeof EstadoTurnoSchema>;
