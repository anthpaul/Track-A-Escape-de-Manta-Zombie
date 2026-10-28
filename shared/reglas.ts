/**
 * Game rules — shared between the simulator and the route motor.
 *
 * ALL rules that govern what is legal or dangerous in the game world live here.
 * Neither tools/simulador/ nor backend/ may re-implement these; they import them.
 *
 * All functions are pure: no IO, no global state, no side effects.
 * The `aleatorio` parameter is always injected by the caller so tests can
 * use a fixed sequence and the simulator uses its seeded generator.
 *
 * References: AGENTS.md §§ 0 (enunciado), 4.4 (costos de peligro), 4.5 (turno)
 */
import type { GrafoIndexado } from "./grafo";
import type { Zombie, Sobreviviente, TipoZombie } from "./schemas";

// -------------------------------------------------------------------------
// Re-export the canonical zombie type so callers only need one import.
// -------------------------------------------------------------------------
export type { Zombie, Sobreviviente, TipoZombie };

// -------------------------------------------------------------------------
// Internal zombie state (simulator-only fields not visible in public snapshots)
// -------------------------------------------------------------------------

/**
 * Extended zombie record used internally by the simulator.
 * `dormido` zombies are NEVER included in public `/estado` snapshots
 * (EstadoTurnoSchema uses ZombieVisibleSchema which excludes "dormido").
 * The simulator keeps them here and awakens them when a survivor gets close.
 */
export interface ZombieInterno extends Zombie {
  tipo: TipoZombie;
  /** Caminante moves once every 2 turns — tracks whether it moved last turn. */
  movioPasadoTurno?: boolean;
}

// -------------------------------------------------------------------------
// 1. Distance (BFS hop count) — used for proximity checks
// -------------------------------------------------------------------------

/**
 * Return the shortest-path hop count from `origen` to `destino` in the graph,
 * ignoring blocked streets (proximity checks use the full topology).
 * Returns Infinity if unreachable.
 *
 * Used for:
 *   - Corredor pursuit: attack if survivor is within 3 hops.
 *   - Dormido awakening: wake up if survivor is within 2 hops.
 */
export function distanciaHops(
  grafo: GrafoIndexado,
  origen: string,
  destino: string,
): number {
  if (origen === destino) return 0;
  const visitado = new Set([origen]);
  const cola: Array<{ nodo: string; pasos: number }> = [{ nodo: origen, pasos: 0 }];
  for (let i = 0; i < cola.length; i++) {
    const { nodo, pasos } = cola[i]!;
    for (const vecino of grafo.vecinos(nodo)) {
      if (vecino === destino) return pasos + 1;
      if (!visitado.has(vecino)) {
        visitado.add(vecino);
        cola.push({ nodo: vecino, pasos: pasos + 1 });
      }
    }
  }
  return Infinity;
}

// -------------------------------------------------------------------------
// 2. Zombie movement — S2
// -------------------------------------------------------------------------

/**
 * Move a single zombie according to its type rules.
 * Returns the new node ID (same node if the zombie does not move this turn).
 *
 * Rules (AGENTS.md §0 — Requisitos):
 *   Caminante : moves 1 street every 2 turns, random direction.
 *   Corredor  : moves 2 streets per turn; pursues if a survivor is ≤3 hops.
 *   Horda     : almost immobile — never moves (blocks its node + neighbors).
 *   Dormido   : invisible until a survivor is ≤2 hops; awakens as Caminante.
 *               Movement after awakening is handled by the Caminante rule.
 *
 * @param zombie      The zombie to move (ZombieInterno with simulator state).
 * @param grafo       Indexed graph.
 * @param aristasBloqueadas  Currently blocked street IDs.
 * @param sobrevivientes     Active survivors (Corredor uses these for pursuit).
 * @param aleatorio   Seeded random number generator () => [0, 1).
 * @param turno       Current turn number (Caminante uses parity).
 */
export function moverZombie(
  zombie: ZombieInterno,
  grafo: GrafoIndexado,
  aristasBloqueadas: readonly string[],
  sobrevivientes: readonly Sobreviviente[],
  aleatorio: () => number,
  turno: number,
): { nuevoNodo: string; movioPasadoTurno: boolean } {
  const activos = sobrevivientes.filter((s) => s.estado === "en_ruta");

  switch (zombie.tipo) {
    case "horda":
    case "dormido":
      // Horda never moves. Dormido is immobile until it awakens (handled in
      // despertarDormidos); after awakening its type becomes "caminante".
      return { nuevoNodo: zombie.nodo, movioPasadoTurno: false };

    case "caminante": {
      // Moves 1 street every 2 turns (alternating).
      if (zombie.movioPasadoTurno) {
        return { nuevoNodo: zombie.nodo, movioPasadoTurno: false };
      }
      const destino = elegirVecinoAleatorio(zombie.nodo, grafo, aristasBloqueadas, aleatorio);
      return { nuevoNodo: destino ?? zombie.nodo, movioPasadoTurno: true };
    }

    case "corredor": {
      // Moves up to 2 streets per turn.
      // If a survivor is within 3 hops, pursue the closest one.
      const objetivo = encontrarObjetivoCorredor(zombie.nodo, activos, grafo);
      let nodoActual = zombie.nodo;
      for (let paso = 0; paso < 2; paso++) {
        const siguiente = objetivo
          ? perseguir(nodoActual, objetivo, grafo, aristasBloqueadas)
          : elegirVecinoAleatorio(nodoActual, grafo, aristasBloqueadas, aleatorio);
        if (siguiente === null) break;
        nodoActual = siguiente;
      }
      return { nuevoNodo: nodoActual, movioPasadoTurno: true };
    }
  }
}

/** Pick a random unblocked neighbor, or null if all are blocked. */
function elegirVecinoAleatorio(
  nodo: string,
  grafo: GrafoIndexado,
  aristasBloqueadas: readonly string[],
  aleatorio: () => number,
): string | null {
  const disponibles = grafo
    .vecinos(nodo)
    .filter((v) => grafo.esMovimientoValido(nodo, v, aristasBloqueadas));
  if (disponibles.length === 0) return null;
  return disponibles[Math.floor(aleatorio() * disponibles.length)]!;
}

/**
 * Find the closest active survivor within 3 hops, or null if none.
 * Used by Corredor to decide whether to pursue.
 */
function encontrarObjetivoCorredor(
  nodoZombie: string,
  activos: readonly Sobreviviente[],
  grafo: GrafoIndexado,
): string | null {
  let mejorNodo: string | null = null;
  let mejorDistancia = Infinity;
  for (const s of activos) {
    const d = distanciaHops(grafo, nodoZombie, s.nodo);
    if (d <= 3 && d < mejorDistancia) {
      mejorDistancia = d;
      mejorNodo = s.nodo;
    }
  }
  return mejorNodo;
}

/**
 * Move one step toward a target node via BFS shortest path.
 * Returns the next node on the path, or null if no valid unblocked path exists.
 */
function perseguir(
  desde: string,
  hacia: string,
  grafo: GrafoIndexado,
  aristasBloqueadas: readonly string[],
): string | null {
  if (desde === hacia) return null;
  // BFS to find the next hop on the shortest path.
  const padre = new Map<string, string>([[desde, desde]]);
  const cola = [desde];
  let encontrado = false;
  for (let i = 0; i < cola.length && !encontrado; i++) {
    for (const vecino of grafo.vecinos(cola[i]!)) {
      if (padre.has(vecino)) continue;
      if (!grafo.esMovimientoValido(cola[i]!, vecino, aristasBloqueadas)) continue;
      padre.set(vecino, cola[i]!);
      if (vecino === hacia) { encontrado = true; break; }
      cola.push(vecino);
    }
  }
  if (!encontrado) return null;
  // Walk back from target to find the first step after `desde`.
  let nodo = hacia;
  while (padre.get(nodo) !== desde) {
    const p = padre.get(nodo);
    if (p === undefined || p === nodo) return null;
    nodo = p;
  }
  return nodo;
}

// -------------------------------------------------------------------------
// 3. Dormido awakening — S2
// -------------------------------------------------------------------------

/**
 * Wake up sleeping zombies that are within 2 hops of any active survivor.
 * Mutates the zombie array in place: changes tipo from "dormido" to "caminante".
 * Call this BEFORE moverZombie so newly awakened zombies move in the same turn.
 *
 * Dormidos are never in public snapshots; the simulator tracks them internally.
 */
export function despertarDormidos(
  zombies: ZombieInterno[],
  sobrevivientes: readonly Sobreviviente[],
  grafo: GrafoIndexado,
): void {
  const activos = sobrevivientes.filter((s) => s.estado === "en_ruta");
  for (const zombie of zombies) {
    if (zombie.tipo !== "dormido") continue;
    for (const s of activos) {
      if (distanciaHops(grafo, zombie.nodo, s.nodo) <= 2) {
        zombie.tipo = "caminante";
        zombie.movioPasadoTurno = false;
        break;
      }
    }
  }
}

// -------------------------------------------------------------------------
// 4. City events — S2
// -------------------------------------------------------------------------

/**
 * Apply a city event (bridge collapse, avenue blockage) by adding the
 * street ID to the blocked list if it is not already there.
 * Returns a new array — does not mutate the original.
 */
export function aplicarBloqueo(
  aristasBloqueadas: readonly string[],
  calleId: string,
): string[] {
  if (aristasBloqueadas.includes(calleId)) return [...aristasBloqueadas];
  return [...aristasBloqueadas, calleId];
}

// -------------------------------------------------------------------------
// 5. Bite resolution — S3
// -------------------------------------------------------------------------

/**
 * Resolve node-sharing bites: a survivor is bitten if, at the END of a turn,
 * they share a node with any zombie (AGENTS.md §0 — Mordida).
 *
 * Marks bitten survivors as "mordido" in place.
 * Sleeping zombies (dormido) are invisible — they cannot bite.
 */
export function resolverMordidasPorNodo(
  sobrevivientes: Sobreviviente[],
  zombies: readonly ZombieInterno[],
): void {
  // Only visible (non-dormido) zombies can bite.
  const nodosZombieVisibles = new Set(
    zombies.filter((z) => z.tipo !== "dormido").map((z) => z.nodo),
  );
  for (const s of sobrevivientes) {
    if (s.estado !== "en_ruta" || s.vehiculo) continue; // riding a rescue van: protected
    if (nodosZombieVisibles.has(s.nodo)) {
      s.estado = "mordido";
    }
  }
}

/**
 * Resolve crossing bites: a survivor is bitten if they cross a street in the
 * opposite direction to a zombie in the same turn (AGENTS.md §0 — Mordida).
 *
 * A crossing bite occurs when:
 *   survivor:  nodo A → nodo B  (via calle C-xxxx)
 *   zombie:    nodo B → nodo A  (via the same calle C-xxxx)
 *
 * @param sobrevivientes  Survivors AFTER their move (current nodo = B).
 * @param previoSobrevivientes  Survivors BEFORE their move (nodo = A).
 * @param zombies  Zombies AFTER their move (current nodo = A, moved from B).
 * @param previoZombies  Zombies BEFORE their move (nodo = B).
 * @param grafo  Indexed graph (to look up street IDs).
 */
export function resolverMordidasPorCruce(
  sobrevivientes: Sobreviviente[],
  previoSobrevivientes: readonly Pick<Sobreviviente, "id" | "nodo">[],
  zombies: readonly ZombieInterno[],
  previoZombies: readonly Pick<ZombieInterno, "id" | "nodo" | "tipo">[],
  grafo: GrafoIndexado,
): void {
  // Build a map of zombie movement: calleId → Set of (previoNodo) for each zombie that crossed.
  // Only visible zombies can cause crossing bites.
  // We store the node the zombie CAME FROM so we can detect opposite directions.
  const callesCruzadasPorZombies = new Map<string, Set<string>>(); // calleId → Set<nodoOrigen>
  for (const zombie of zombies) {
    if (zombie.tipo === "dormido") continue;
    const previo = previoZombies.find((z) => z.id === zombie.id);
    if (!previo || previo.nodo === zombie.nodo) continue;  // did not move
    const calle = grafo.calleEntre(previo.nodo, zombie.nodo);
    if (!calle) continue;
    if (!callesCruzadasPorZombies.has(calle.id)) {
      callesCruzadasPorZombies.set(calle.id, new Set());
    }
    callesCruzadasPorZombies.get(calle.id)!.add(previo.nodo);
  }

  if (callesCruzadasPorZombies.size === 0) return;

  // Check each survivor: did they cross the same street in the OPPOSITE direction?
  for (const s of sobrevivientes) {
    if (s.estado !== "en_ruta" || s.vehiculo) continue; // riding a rescue van: protected
    const previo = previoSobrevivientes.find((p) => p.id === s.id);
    if (!previo || previo.nodo === s.nodo) continue;  // did not move
    const calle = grafo.calleEntre(previo.nodo, s.nodo);
    if (!calle) continue;
    const origenesZombie = callesCruzadasPorZombies.get(calle.id);
    if (!origenesZombie) continue;
    // Opposite direction: survivor came FROM a node that a zombie moved TO,
    // i.e. the zombie's origin (previo.nodo) equals survivor's destination (s.nodo)
    // AND the zombie's destination equals survivor's origin (previo.nodo).
    // In other words: a zombie's origin is the survivor's destination (s.nodo).
    if (origenesZombie.has(s.nodo)) {
      s.estado = "mordido";
    }
  }
}

// -------------------------------------------------------------------------
// 6. Shelter arrivals — S3
// -------------------------------------------------------------------------

/**
 * Mark survivors that have reached a refuge node as "a_salvo".
 * Call this AFTER resolving bites so a bitten survivor at a refuge is "mordido",
 * not "a_salvo".
 *
 * With `capacidades` (refuge node → capacity, Pro), a full refuge admits nobody else: whoever
 * arrives stays "en_ruta" at the door. Simultaneous arrivals get in by id until it is full.
 */
export function resolverLlegadas(
  sobrevivientes: Sobreviviente[],
  nodosRefugio: ReadonlySet<string>,
  capacidades?: ReadonlyMap<string, number>,
): void {
  const ocupacion = new Map<string, number>();
  for (const s of sobrevivientes) {
    if (s.estado === "a_salvo") ocupacion.set(s.nodo, (ocupacion.get(s.nodo) ?? 0) + 1);
  }
  const llegando = sobrevivientes
    // People riding a rescue van get out when the van drops them off (flota.ts), not when it drives by.
    .filter((s) => s.estado === "en_ruta" && !s.vehiculo && nodosRefugio.has(s.nodo))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const s of llegando) {
    const capacidad = capacidades?.get(s.nodo) ?? Infinity;
    const dentro = ocupacion.get(s.nodo) ?? 0;
    if (dentro >= capacidad) continue;
    s.estado = "a_salvo";
    ocupacion.set(s.nodo, dentro + 1);
  }
}

// -------------------------------------------------------------------------
// 7. Visible zombie filter — for public snapshots
// -------------------------------------------------------------------------

/**
 * Return only the zombies that should appear in public snapshots (GET /estado).
 * Sleeping zombies are invisible until they awaken.
 */
export function zombiesVisibles(
  zombies: readonly ZombieInterno[],
): Zombie[] {
  return zombies
    .filter((z) => z.tipo !== "dormido")
    .map(({ id, tipo, nodo }) => ({ id, tipo: tipo as Exclude<TipoZombie, "dormido">, nodo }));
}
