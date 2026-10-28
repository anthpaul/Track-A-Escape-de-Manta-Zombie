/**
 * Shelter capacity (Pro): "que ninguno llegue a un refugio lleno".
 *
 * One deterministic slot allocation per turn, computed from the turn alone, so every /paso call of
 * the same turn agrees without coordinating and nothing is written (AGENTS.md §4.2):
 *   1. Free places per shelter = capacity − survivors already safe on its node.
 *   2. Every (survivor on the road, shelter) pair, sorted by street distance (closed streets skipped),
 *      then by survivor id: each survivor takes the closest shelter that still has a free place.
 *   3. A survivor may head to their own shelter and to any shelter whose places nobody claimed.
 *      With more people than places, those left without one are not restricted (they still move
 *      toward safety; the simulator keeps them at the door until a place frees up).
 */
import type { ContextoGrafo } from "./astar";
import type { MundoTurno } from "./fuente-mundo";

export interface Cupos {
  /** Shelters this survivor may head to; undefined = no restriction. */
  refugiosPara(sobrevivienteId: string): ReadonlySet<string> | undefined;
  /** Shelters with at least one free place this turn (second chance when the allowed ones are unreachable). */
  conLugar: ReadonlySet<string>;
}

// Street distance from one node to every node, skipping closed streets (BFS: one street = one turn).
function distancias(contexto: ContextoGrafo, origen: string, bloqueadas: ReadonlySet<string>): Map<string, number> {
  const dist = new Map([[origen, 0]]);
  const cola = [origen];
  for (let i = 0; i < cola.length; i++) {
    const nodo = cola[i]!;
    for (const vecino of contexto.indexado.vecinos(nodo)) {
      if (dist.has(vecino)) continue;
      const calle = contexto.indexado.calleEntre(nodo, vecino);
      if (calle && bloqueadas.has(calle.id)) continue;
      dist.set(vecino, dist.get(nodo)! + 1);
      cola.push(vecino);
    }
  }
  return dist;
}

// The same turn object is shared by every request of that turn (FuenteMundo caches it): allocate once.
type MundoCupos = Pick<MundoTurno, "aristasBloqueadas" | "sobrevivientes">;
const cache = new WeakMap<MundoCupos, Cupos | null>();

export function asignarCupos(contexto: ContextoGrafo, mundo: MundoCupos): Cupos | null {
  if (cache.has(mundo)) return cache.get(mundo)!;
  const resultado = calcular(contexto, mundo);
  cache.set(mundo, resultado);
  return resultado;
}

function calcular(contexto: ContextoGrafo, mundo: MundoCupos): Cupos | null {
  if (!mundo.sobrevivientes) return null;
  const libres = new Map(contexto.refugios.map((r) => [r.id, r.capacidad]));
  const refugioDeNodo = new Map(contexto.refugios.map((r) => [r.nodo, r.id]));
  for (const s of mundo.sobrevivientes) {
    const refugio = s.estado === "a_salvo" ? refugioDeNodo.get(s.nodo) : undefined;
    if (refugio) libres.set(refugio, libres.get(refugio)! - 1);
  }
  const conLugar = new Set([...libres].filter(([, n]) => n > 0).map(([id]) => id));

  const bloqueadas = new Set(mundo.aristasBloqueadas);
  const enRuta = mundo.sobrevivientes.filter((s) => s.estado === "en_ruta");
  const pares: { id: string; refugio: string; d: number }[] = [];
  for (const r of contexto.refugios) {
    if (!conLugar.has(r.id)) continue;
    const dist = distancias(contexto, r.nodo, bloqueadas);
    for (const s of enRuta) {
      const d = dist.get(s.nodo);
      if (d !== undefined) pares.push({ id: s.id, refugio: r.id, d });
    }
  }
  pares.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id) || a.refugio.localeCompare(b.refugio));

  const asignado = new Map<string, string>();
  for (const { id, refugio } of pares) {
    if (asignado.has(id) || libres.get(refugio)! <= 0) continue;
    asignado.set(id, refugio);
    libres.set(refugio, libres.get(refugio)! - 1);
  }
  const sinReclamar = [...libres].filter(([, n]) => n > 0).map(([id]) => id);

  return {
    refugiosPara(id) {
      const propio = asignado.get(id);
      return propio === undefined ? undefined : new Set([propio, ...sinReclamar]);
    },
    conLugar,
  };
}
