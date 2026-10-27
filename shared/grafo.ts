import { GrafoSchema, type Calle, type TipoCalle, type Zombie } from "./schemas";

export const VELOCIDADES_M_S: Readonly<Record<TipoCalle, number>> = Object.freeze({
  avenida: 1.6, calle: 1.4, puente: 1.2, callejon: 1.0,
});

type Bloqueos = ReadonlySet<string> | readonly string[];

export interface GrafoIndexado {
  vecinos(nodo: string): readonly string[];
  calleEntre(desde: string, hasta: string): Readonly<Calle> | undefined;
  esMovimientoValido(desde: string, hasta: string, aristasBloqueadas: Bloqueos): boolean;
  nodosBloqueadosPorHordas(zombies: readonly Zombie[]): Set<string>;
}

/** Validate and index the static graph once, outside the per-survivor request path. */
export function crearGrafo(input: unknown): GrafoIndexado {
  const graph = GrafoSchema.parse(input);
  const neighbors = new Map(graph.nodos.map((node) => [node.id, [] as string[]]));
  const streets = new Map<string, Readonly<Calle>>();
  const key = (from: string, to: string) => `${from}|${to}`;

  for (const street of graph.calles) {
    neighbors.get(street.desde)!.push(street.hasta);
    neighbors.get(street.hasta)!.push(street.desde);
    for (const point of street.geometria) Object.freeze(point);
    Object.freeze(street.geometria);
    Object.freeze(street);
    streets.set(key(street.desde, street.hasta), street);
    streets.set(key(street.hasta, street.desde), street);
  }
  for (const adjacent of neighbors.values()) Object.freeze(adjacent);
  const empty: readonly string[] = Object.freeze([]);
  const vecinos = (node: string): readonly string[] => neighbors.get(node) ?? empty;
  const calleEntre = (from: string, to: string) => streets.get(key(from, to));

  return Object.freeze({
    vecinos,
    calleEntre,
    esMovimientoValido(from: string, to: string, blocked: Bloqueos): boolean {
      if (!neighbors.has(from) || !neighbors.has(to)) return false;
      if (from === to) return true;
      const street = calleEntre(from, to);
      return street !== undefined && !("has" in blocked ? blocked.has(street.id) : blocked.includes(street.id));
    },
    nodosBloqueadosPorHordas(zombies: readonly Zombie[]): Set<string> {
      const blocked = new Set<string>();
      for (const zombie of zombies) {
        if (zombie.tipo !== "horda") continue;
        blocked.add(zombie.nodo);
        for (const neighbor of vecinos(zombie.nodo)) blocked.add(neighbor);
      }
      return blocked;
    },
  });
}
