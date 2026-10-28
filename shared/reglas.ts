/**
 * Reglas del juego, compartidas entre el simulador y el motor de rutas.
 *
 * TODAS las reglas que definen qué es legal o peligroso en el mundo del juego viven acá.
 * Ni tools/simulador/ ni backend/ pueden reimplementarlas: las importan.
 *
 * Todas las funciones son puras: sin IO, sin estado global y sin efectos secundarios.
 * El parámetro `aleatorio` siempre lo inyecta quien llama, para que los tests usen
 * una secuencia fija y el simulador use su generador con semilla.
 *
 * Referencias: AGENTS.md §§ 0 (enunciado), 4.4 (costos de peligro), 4.5 (turno)
 */
import type { GrafoIndexado } from "./grafo";
import type { Zombie, Sobreviviente, TipoZombie } from "./schemas";

// -------------------------------------------------------------------------
// Reexporta el tipo canónico de zombie para que quien llama necesite un solo import.
// -------------------------------------------------------------------------
export type { Zombie, Sobreviviente, TipoZombie };

// -------------------------------------------------------------------------
// Estado interno del zombie (campos solo del simulador, no visibles en los snapshots públicos)
// -------------------------------------------------------------------------

/**
 * Registro extendido de zombie que el simulador usa internamente.
 * Los zombies `dormido` NUNCA se incluyen en los snapshots públicos de `/estado`
 * (EstadoTurnoSchema usa ZombieVisibleSchema, que excluye "dormido").
 * El simulador los guarda acá y los despierta cuando un sobreviviente se acerca.
 */
export interface ZombieInterno extends Zombie {
  tipo: TipoZombie;
  /** El caminante se mueve una vez cada 2 turnos: registra si se movió en el turno anterior. */
  movioPasadoTurno?: boolean;
}

// -------------------------------------------------------------------------
// 1. Distancia (cantidad de saltos por BFS), usada en los chequeos de proximidad
// -------------------------------------------------------------------------

/**
 * Devuelve la cantidad de saltos del camino más corto de `origen` a `destino` en el grafo,
 * ignorando las calles bloqueadas (los chequeos de proximidad usan la topología completa).
 * Devuelve Infinity si no es alcanzable.
 *
 * Se usa para:
 *   - Persecución del corredor: ataca si un sobreviviente está a 3 saltos o menos.
 *   - Despertar del dormido: despierta si un sobreviviente está a 2 saltos o menos.
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
// 2. Movimiento de zombies (S2)
// -------------------------------------------------------------------------

/**
 * Mueve un zombie según las reglas de su tipo.
 * Devuelve el id del nuevo nodo (el mismo nodo si el zombie no se mueve este turno).
 *
 * Reglas (AGENTS.md §0 — Requisitos):
 *   Caminante : 1 calle cada 2 turnos, en dirección aleatoria.
 *   Corredor  : 2 calles por turno; persigue si hay un sobreviviente a ≤3 saltos.
 *   Horda     : casi inmóvil; nunca se mueve (bloquea su nodo y sus vecinos).
 *   Dormido   : invisible hasta que un sobreviviente está a ≤2 saltos; despierta como Caminante.
 *               Después de despertar, su movimiento lo maneja la regla del Caminante.
 *
 * @param zombie      El zombie a mover (ZombieInterno con estado del simulador).
 * @param grafo       Grafo indexado.
 * @param aristasBloqueadas  Ids de las calles bloqueadas en este momento.
 * @param sobrevivientes     Sobrevivientes activos (el Corredor los usa para perseguir).
 * @param aleatorio   Generador de números aleatorios con semilla () => [0, 1).
 * @param turno       Número de turno actual (el Caminante usa su paridad).
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
      // La horda nunca se mueve. El dormido queda inmóvil hasta despertar (lo maneja
      // despertarDormidos); al despertar, su tipo pasa a ser "caminante".
      return { nuevoNodo: zombie.nodo, movioPasadoTurno: false };

    case "caminante": {
      // Se mueve 1 calle cada 2 turnos (alternando).
      if (zombie.movioPasadoTurno) {
        return { nuevoNodo: zombie.nodo, movioPasadoTurno: false };
      }
      const destino = elegirVecinoAleatorio(zombie.nodo, grafo, aristasBloqueadas, aleatorio);
      return { nuevoNodo: destino ?? zombie.nodo, movioPasadoTurno: true };
    }

    case "corredor": {
      // Se mueve hasta 2 calles por turno.
      // Si hay un sobreviviente a 3 saltos o menos, persigue al más cercano.
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

/** Elige un vecino no bloqueado al azar, o null si todos están bloqueados. */
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
 * Busca el sobreviviente activo más cercano a 3 saltos o menos, o null si no hay ninguno.
 * El Corredor lo usa para decidir si persigue.
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
 * Avanza un paso hacia un nodo objetivo por el camino más corto (BFS).
 * Devuelve el siguiente nodo del camino, o null si no existe un camino válido sin bloqueos.
 */
function perseguir(
  desde: string,
  hacia: string,
  grafo: GrafoIndexado,
  aristasBloqueadas: readonly string[],
): string | null {
  if (desde === hacia) return null;
  // BFS para encontrar el siguiente salto del camino más corto.
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
  // Recorre hacia atrás desde el objetivo para encontrar el primer paso después de `desde`.
  let nodo = hacia;
  while (padre.get(nodo) !== desde) {
    const p = padre.get(nodo);
    if (p === undefined || p === nodo) return null;
    nodo = p;
  }
  return nodo;
}

// -------------------------------------------------------------------------
// 3. Despertar de los dormidos (S2)
// -------------------------------------------------------------------------

/**
 * Despierta a los zombies dormidos que están a 2 saltos o menos de algún sobreviviente activo.
 * Modifica el arreglo de zombies en el lugar: cambia `tipo` de "dormido" a "caminante".
 * Llamarla ANTES de moverZombie, para que los recién despertados se muevan en el mismo turno.
 *
 * Los dormidos nunca están en los snapshots públicos; el simulador los sigue internamente.
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
// 4. Eventos de ciudad (S2)
// -------------------------------------------------------------------------

/**
 * Aplica un evento de ciudad (colapso de un puente, bloqueo de una avenida) agregando
 * el id de la calle a la lista de bloqueadas si todavía no está.
 * Devuelve un arreglo nuevo: no modifica el original.
 */
export function aplicarBloqueo(
  aristasBloqueadas: readonly string[],
  calleId: string,
): string[] {
  if (aristasBloqueadas.includes(calleId)) return [...aristasBloqueadas];
  return [...aristasBloqueadas, calleId];
}

// -------------------------------------------------------------------------
// 5. Resolución de mordidas (S3)
// -------------------------------------------------------------------------

/**
 * Resuelve las mordidas por nodo compartido: un sobreviviente es mordido si, al FINAL
 * de un turno, comparte nodo con algún zombie (AGENTS.md §0 — Mordida).
 *
 * Marca en el lugar a los mordidos como "mordido".
 * Los zombies dormidos son invisibles: no pueden morder.
 */
export function resolverMordidasPorNodo(
  sobrevivientes: Sobreviviente[],
  zombies: readonly ZombieInterno[],
): void {
  // Solo los zombies visibles (no dormidos) pueden morder.
  const nodosZombieVisibles = new Set(
    zombies.filter((z) => z.tipo !== "dormido").map((z) => z.nodo),
  );
  for (const s of sobrevivientes) {
    if (s.estado !== "en_ruta" || s.vehiculo) continue; // viaja en una camioneta de rescate: protegido
    if (nodosZombieVisibles.has(s.nodo)) {
      s.estado = "mordido";
    }
  }
}

/**
 * Resuelve las mordidas por cruce: un sobreviviente es mordido si cruza una calle en
 * dirección opuesta a un zombie en el mismo turno (AGENTS.md §0 — Mordida).
 *
 * Hay mordida por cruce cuando:
 *   sobreviviente:  nodo A → nodo B  (por la calle C-xxxx)
 *   zombie:         nodo B → nodo A  (por la misma calle C-xxxx)
 *
 * @param sobrevivientes  Sobrevivientes DESPUÉS de moverse (nodo actual = B).
 * @param previoSobrevivientes  Sobrevivientes ANTES de moverse (nodo = A).
 * @param zombies  Zombies DESPUÉS de moverse (nodo actual = A, vienen de B).
 * @param previoZombies  Zombies ANTES de moverse (nodo = B).
 * @param grafo  Grafo indexado (para buscar los ids de las calles).
 */
export function resolverMordidasPorCruce(
  sobrevivientes: Sobreviviente[],
  previoSobrevivientes: readonly Pick<Sobreviviente, "id" | "nodo">[],
  zombies: readonly ZombieInterno[],
  previoZombies: readonly Pick<ZombieInterno, "id" | "nodo" | "tipo">[],
  grafo: GrafoIndexado,
): void {
  // Arma un mapa del movimiento de zombies: calleId → Set de (previoNodo) por cada zombie que cruzó.
  // Solo los zombies visibles pueden causar mordidas por cruce.
  // Se guarda el nodo DE DONDE VINO el zombie para detectar direcciones opuestas.
  const callesCruzadasPorZombies = new Map<string, Set<string>>(); // calleId → Set<nodoOrigen>
  for (const zombie of zombies) {
    if (zombie.tipo === "dormido") continue;
    const previo = previoZombies.find((z) => z.id === zombie.id);
    if (!previo || previo.nodo === zombie.nodo) continue;  // no se movió
    const calle = grafo.calleEntre(previo.nodo, zombie.nodo);
    if (!calle) continue;
    if (!callesCruzadasPorZombies.has(calle.id)) {
      callesCruzadasPorZombies.set(calle.id, new Set());
    }
    callesCruzadasPorZombies.get(calle.id)!.add(previo.nodo);
  }

  if (callesCruzadasPorZombies.size === 0) return;

  // Revisa cada sobreviviente: ¿cruzó la misma calle en dirección OPUESTA?
  for (const s of sobrevivientes) {
    if (s.estado !== "en_ruta" || s.vehiculo) continue; // viaja en una camioneta de rescate: protegido
    const previo = previoSobrevivientes.find((p) => p.id === s.id);
    if (!previo || previo.nodo === s.nodo) continue;  // no se movió
    const calle = grafo.calleEntre(previo.nodo, s.nodo);
    if (!calle) continue;
    const origenesZombie = callesCruzadasPorZombies.get(calle.id);
    if (!origenesZombie) continue;
    // Dirección opuesta: el sobreviviente vino DESDE un nodo al que un zombie se movió,
    // es decir, el origen del zombie (previo.nodo) es el destino del sobreviviente (s.nodo)
    // Y el destino del zombie es el origen del sobreviviente (previo.nodo).
    // En otras palabras: el origen de algún zombie es el destino del sobreviviente (s.nodo).
    if (origenesZombie.has(s.nodo)) {
      s.estado = "mordido";
    }
  }
}

// -------------------------------------------------------------------------
// 6. Llegadas a refugios (S3)
// -------------------------------------------------------------------------

/**
 * Marca como "a_salvo" a los sobrevivientes que llegaron a un nodo de refugio.
 * Llamarla DESPUÉS de resolver las mordidas, para que un mordido en un refugio quede
 * "mordido" y no "a_salvo".
 *
 * Con `capacidades` (nodo de refugio → capacidad, Pro), un refugio lleno no admite a nadie más:
 * quien llega queda "en_ruta" en la puerta. Las llegadas simultáneas entran por orden de id
 * hasta llenarlo.
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
    // Quienes viajan en una camioneta de rescate bajan cuando la camioneta los deja (flota.ts), no al pasar.
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
// 7. Filtro de zombies visibles, para los snapshots públicos
// -------------------------------------------------------------------------

/**
 * Devuelve solo los zombies que deben aparecer en los snapshots públicos (GET /estado).
 * Los dormidos son invisibles hasta que despiertan.
 */
export function zombiesVisibles(
  zombies: readonly ZombieInterno[],
): Zombie[] {
  return zombies
    .filter((z) => z.tipo !== "dormido")
    .map(({ id, tipo, nodo }) => ({ id, tipo: tipo as Exclude<TipoZombie, "dormido">, nodo }));
}
