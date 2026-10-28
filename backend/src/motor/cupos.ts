/**
 * Capacidad de refugios (Pro): "que ninguno llegue a un refugio lleno".
 *
 * Un reparto determinista de cupos por turno, calculado solo a partir del turno, para que todas las
 * llamadas a /paso del mismo turno coincidan sin coordinarse y sin escribir nada (AGENTS.md §4.2):
 *   1. Lugares libres por refugio = capacidad − sobrevivientes que ya están a salvo en su nodo.
 *   2. Todos los pares (sobreviviente en camino, refugio), ordenados por distancia en calles (sin
 *      contar las cerradas) y luego por id del sobreviviente: cada uno toma el refugio más cercano
 *      que todavía tenga un lugar libre.
 *   3. Un sobreviviente puede dirigirse a su propio refugio y a cualquier refugio cuyos lugares nadie
 *      reclamó. Si hay más personas que lugares, quienes se quedan sin uno no tienen restricción
 *      (siguen avanzando hacia un lugar seguro; el simulador los deja en la puerta hasta que se
 *      libere un lugar).
 */
import type { ContextoGrafo } from "./astar";
import type { MundoTurno } from "./fuente-mundo";

export interface Cupos {
  /** Refugios a los que puede dirigirse este sobreviviente; undefined = sin restricción. */
  refugiosPara(sobrevivienteId: string): ReadonlySet<string> | undefined;
  /** Refugios con al menos un lugar libre en este turno (segunda opción cuando los permitidos son inalcanzables). */
  conLugar: ReadonlySet<string>;
}

// Distancia en calles desde un nodo hasta todos los demás, sin pasar por calles cerradas (BFS: una calle = un turno).
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

// Todas las solicitudes de un turno comparten el mismo objeto de turno (FuenteMundo lo cachea): se reparte una sola vez.
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
