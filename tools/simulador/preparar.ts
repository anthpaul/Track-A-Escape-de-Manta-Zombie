import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { GrafoSchema, SobrevivienteSchema, ZombieSchema } from "@abcstack/shared";

// Entrada local del simulador; no es un payload de la API ni un snapshot persistido del mundo.
const ConfigInicialSchema = z.object({
  semilla: z.number().int().min(0).max(0xffffffff),
  zombies: z.array(ZombieSchema),
  sobrevivientes: z.array(SobrevivienteSchema.extend({ estado: z.literal("en_ruta") })),
});

export function crearAleatorio(semilla: number): () => number {
  if (!Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    throw new Error("Seed must be an unsigned 32-bit integer");
  }
  let state = semilla;
  // Mulberry32: azar reproducible para la simulación, no azar criptográfico.
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Prepara un mundo local aislado; no ejecuta turnos, ni llamadas de red, ni escrituras. */
export async function prepararPartida(
  input: unknown,
  rutaGrafo = resolve(__dirname, "../../shared/data/manta.json"),
) {
  const config = ConfigInicialSchema.parse(input);
  const grafo = GrafoSchema.parse(JSON.parse(await readFile(rutaGrafo, "utf8")));
  const nodos = new Set(grafo.nodos.map((nodo) => nodo.id));
  for (const actores of [config.zombies, config.sobrevivientes]) {
    const ids = new Set<string>();
    for (const actor of actores) {
      if (ids.has(actor.id)) throw new Error(`Duplicate ID: ${actor.id}`);
      if (!nodos.has(actor.nodo)) throw new Error(`Unknown node: ${actor.nodo}`);
      ids.add(actor.id);
    }
  }
  return {
    grafo,
    turno: 0,
    semilla: config.semilla,
    zombies: config.zombies,
    sobrevivientes: config.sobrevivientes,
    aleatorio: crearAleatorio(config.semilla),
  };
}
