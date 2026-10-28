/**
 * Flota de rescate (Pro): "5 camionetas el doble de rápidas, hasta 4 personas; a quién recoger y en qué orden".
 *
 * Se ejecuta una vez por turno en el simulador, después del movimiento de los sobrevivientes, las
 * mordidas y las llegadas. Es pura y determinista (sin azar), así que una semilla repite los mismos
 * rescates.
 *
 * A quién y en qué orden:
 *   - los candidatos son sobrevivientes en ruta, a pie, que ninguna otra camioneta eligió este turno;
 *   - quien tiene un zombie visible a 2 calles o menos es urgente y va primero;
 *   - si no, una camioneta solo va por alguien al que llega antes de lo que esa persona llegaría
 *     sola a un refugio (la camioneta recorre 2 calles por turno), y prefiere a quien está más lejos
 *     de ponerse a salvo;
 *   - cada camioneta, en orden de id, toma al candidato con mejor prioridad menos su propia distancia.
 * Con 4 a bordo, o con gente a bordo y nadie a quien valga la pena buscar, la camioneta va al refugio
 * con espacio más cercano y deja bajar a todos los que quepan.
 *
 * Las camionetas nunca entran a un nodo con un zombie visible ni a una zona de horda, nunca usan una
 * calle cerrada y no pueden ser mordidas; tampoco quienes viajan en ellas (reglas.ts omite a los
 * pasajeros).
 */
import type { GrafoIndexado } from "./grafo";
import type { Sobreviviente, Zombie } from "./schemas";

export const VEHICULOS = 5;
export const CAPACIDAD_VEHICULO = 4;
export const CALLES_POR_TURNO = 2;
const DISTANCIA_PELIGRO = 2;

export type Vehiculo = { id: string; nodo: string; pasajeros: string[]; destino: string | null };

export type EventoFlota = { tipo: "recogio" | "dejo"; vehiculo: string; nodo: string; sobrevivientes: string[] };

export interface MundoFlota {
  grafo: GrafoIndexado;
  sobrevivientes: Sobreviviente[];
  zombies: readonly Zombie[];
  aristasBloqueadas: readonly string[];
  nodosRefugio: ReadonlySet<string>;
  capacidadRefugio?: ReadonlyMap<string, number>;
}

/** Cinco camionetas, que arrancan repartidas por turnos entre los refugios. */
export function crearFlota(nodosRefugio: readonly string[], cantidad = VEHICULOS): Vehiculo[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `V-${i + 1}`,
    nodo: nodosRefugio[i % nodosRefugio.length]!,
    pasajeros: [],
    destino: null,
  }));
}

// Distancias en calles desde varios orígenes a la vez (BFS), sin calles cerradas ni nodos prohibidos.
function bfs(mundo: MundoFlota, origenes: readonly string[], prohibidos: ReadonlySet<string> = new Set()) {
  const bloqueadas = new Set(mundo.aristasBloqueadas);
  const dist = new Map<string, number>();
  const previo = new Map<string, string>();
  const cola: string[] = [];
  for (const o of origenes) {
    if (!dist.has(o)) {
      dist.set(o, 0);
      cola.push(o);
    }
  }
  for (let i = 0; i < cola.length; i++) {
    const nodo = cola[i]!;
    for (const vecino of mundo.grafo.vecinos(nodo)) {
      if (dist.has(vecino) || prohibidos.has(vecino)) continue;
      const calle = mundo.grafo.calleEntre(nodo, vecino);
      if (calle && bloqueadas.has(calle.id)) continue;
      dist.set(vecino, dist.get(nodo)! + 1);
      previo.set(vecino, nodo);
      cola.push(vecino);
    }
  }
  return { dist, previo };
}

export function moverFlota(flota: Vehiculo[], mundo: MundoFlota): EventoFlota[] {
  const eventos: EventoFlota[] = [];
  const zombies = mundo.zombies.filter((z) => z.tipo !== "dormido");
  // Donde una camioneta nunca puede estar: zombies visibles y cada nodo de horda con sus vecinos.
  const prohibidos = new Set(zombies.map((z) => z.nodo));
  for (const z of zombies) if (z.tipo === "horda") for (const v of mundo.grafo.vecinos(z.nodo)) prohibidos.add(v);

  const porId = new Map(mundo.sobrevivientes.map((s) => [s.id, s]));
  const ocupacion = new Map<string, number>();
  for (const s of mundo.sobrevivientes) if (s.estado === "a_salvo") ocupacion.set(s.nodo, (ocupacion.get(s.nodo) ?? 0) + 1);
  const libres = (nodo: string) => (mundo.capacidadRefugio?.get(nodo) ?? Infinity) - (ocupacion.get(nodo) ?? 0);

  const distZombie = bfs(mundo, zombies.map((z) => z.nodo)).dist;
  const refugiosConLugar = [...mundo.nodosRefugio].filter((n) => libres(n) > 0);
  const distRefugio = bfs(mundo, refugiosConLugar).dist;
  const elegidos = new Set<string>();

  for (const v of [...flota].sort((a, b) => a.id.localeCompare(b.id))) {
    const desdeVan = bfs(mundo, [v.nodo], prohibidos);

    // 1. A dónde ir este turno.
    let destino: string | null = null;
    if (v.pasajeros.length < CAPACIDAD_VEHICULO) {
      let mejor: { s: Sobreviviente; valor: number } | null = null;
      for (const s of mundo.sobrevivientes) {
        if (s.estado !== "en_ruta" || s.vehiculo || elegidos.has(s.id)) continue;
        const dVan = desdeVan.dist.get(s.nodo);
        if (dVan === undefined) continue;
        const urgente = (distZombie.get(s.nodo) ?? Infinity) <= DISTANCIA_PELIGRO;
        const lejania = distRefugio.get(s.nodo) ?? Infinity;
        // Solo vale la pena si la camioneta llega antes de que esa persona alcance un refugio por su cuenta.
        if (!urgente && Math.ceil(dVan / CALLES_POR_TURNO) >= lejania) continue;
        const valor = (urgente ? 1000 : 0) + Math.min(lejania, 100) * CALLES_POR_TURNO - dVan;
        if (!mejor || valor > mejor.valor || (valor === mejor.valor && s.id < mejor.s.id)) mejor = { s, valor };
      }
      if (mejor) {
        elegidos.add(mejor.s.id);
        destino = mejor.s.nodo;
      }
    }
    if (destino === null && v.pasajeros.length > 0) {
      // Refugio más cercano que todavía admite al menos a una persona más.
      const cercano = refugiosConLugar
        .filter((n) => desdeVan.dist.has(n) && libres(n) > 0)
        .sort((a, b) => desdeVan.dist.get(a)! - desdeVan.dist.get(b)! || a.localeCompare(b))[0];
      destino = cercano ?? null;
    }
    v.destino = destino;

    // 2. Avanzar hasta 2 calles por el camino seguro más corto.
    if (destino !== null && destino !== v.nodo && desdeVan.dist.has(destino)) {
      const camino = [destino];
      while (desdeVan.previo.has(camino[0]!)) camino.unshift(desdeVan.previo.get(camino[0]!)!);
      v.nodo = camino[Math.min(CALLES_POR_TURNO, camino.length - 1)]!;
    }
    for (const id of v.pasajeros) {
      const s = porId.get(id);
      if (s) s.nodo = v.nodo;
    }

    // 3. En un refugio con espacio: bajan todos los que quepan.
    if (mundo.nodosRefugio.has(v.nodo) && v.pasajeros.length > 0) {
      const bajan = v.pasajeros.slice(0, Math.max(0, libres(v.nodo)));
      for (const id of bajan) {
        const s = porId.get(id)!;
        s.estado = "a_salvo";
        delete s.vehiculo;
        ocupacion.set(v.nodo, (ocupacion.get(v.nodo) ?? 0) + 1);
      }
      v.pasajeros = v.pasajeros.slice(bajan.length);
      if (bajan.length > 0) eventos.push({ tipo: "dejo", vehiculo: v.id, nodo: v.nodo, sobrevivientes: bajan });
    }

    // 4. Recoger a quienes esperan a pie en este nodo (primero los más cerca del peligro), hasta 4 a bordo.
    const suben = mundo.sobrevivientes
      .filter((s) => s.estado === "en_ruta" && !s.vehiculo && s.nodo === v.nodo)
      .sort((a, b) => (distZombie.get(a.nodo) ?? Infinity) - (distZombie.get(b.nodo) ?? Infinity) || a.id.localeCompare(b.id))
      .slice(0, CAPACIDAD_VEHICULO - v.pasajeros.length);
    for (const s of suben) {
      s.vehiculo = v.id;
      v.pasajeros.push(s.id);
    }
    if (suben.length > 0) eventos.push({ tipo: "recogio", vehiculo: v.id, nodo: v.nodo, sobrevivientes: suben.map((s) => s.id) });
  }
  return eventos;
}
