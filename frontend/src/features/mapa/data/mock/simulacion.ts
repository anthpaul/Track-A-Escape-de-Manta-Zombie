import type { Grafo, Snapshot, Sobreviviente, Zombie } from "@/features/mapa/domain/tipos";
import { nodosBloqueadosPorHordas, vecinos } from "@/features/mapa/domain/grafo";

// /api/estado falso para construir el mapa antes de que exista el simulador real (S1–S5).
// Reglas simplificadas, NO las oficiales: el simulador real vive en tools/simulador/.

export type ConfigSimulacion = {
  sobrevivientes: number;
  caminantes: number;
  corredores: number;
  hordas: number;
  semilla: number;
};

// Turnos en los que un evento de ciudad simulado bloquea una calle (al estilo de R2/R3).
const EVENTOS_BLOQUEO: Record<number, (g: Grafo) => string | undefined> = {
  8: (g) => g.calles.find((c) => c.tipo === "puente")?.id,
  16: (g) => g.calles.find((c) => c.tipo === "avenida")?.id,
};

// PRNG determinista y pequeño, para que la misma semilla repita siempre la misma ronda.
function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const elegir = <T>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

// Índices construidos una vez por grafo: el grafo real tiene 384 calles y 200 sobrevivientes las consultan en cada turno.
type Indices = { adyacencia: Map<string, string[]>; calles: Map<string, string> };
const cacheIndices = new WeakMap<Grafo, Indices>();
const claveCalle = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function indices(grafo: Grafo): Indices {
  let i = cacheIndices.get(grafo);
  if (!i) {
    i = { adyacencia: vecinos(grafo), calles: new Map(grafo.calles.map((c) => [claveCalle(c.desde, c.hasta), c.id])) };
    cacheIndices.set(grafo, i);
  }
  return i;
}

const calleBloqueada = (grafo: Grafo, a: string, b: string, bloqueadas: Set<string>) =>
  bloqueadas.has(indices(grafo).calles.get(claveCalle(a, b)) ?? "");

// BFS multiorigen desde cada refugio por las calles abiertas: distancia al refugio más cercano para cada nodo.
function distanciaARefugio(grafo: Grafo, bloqueadas: Set<string>, evitar: Set<string>): Map<string, number> {
  const { adyacencia } = indices(grafo);
  const dist = new Map<string, number>();
  const cola = grafo.refugios.map((r) => r.nodo);
  for (const n of cola) dist.set(n, 0);
  while (cola.length > 0) {
    const actual = cola.shift()!;
    for (const v of adyacencia.get(actual) ?? []) {
      if (dist.has(v) || evitar.has(v)) continue;
      if (calleBloqueada(grafo, actual, v, bloqueadas)) continue;
      dist.set(v, dist.get(actual)! + 1);
      cola.push(v);
    }
  }
  return dist;
}

function proximoPaso(grafo: Grafo, nodo: string, dist: Map<string, number>, bloqueadas: Set<string>, evitar: Set<string>) {
  const propia = dist.get(nodo);
  if (propia === undefined || propia === 0) return nodo;
  for (const v of indices(grafo).adyacencia.get(nodo) ?? []) {
    if (evitar.has(v) || calleBloqueada(grafo, nodo, v, bloqueadas)) continue;
    if (dist.get(v) === propia - 1) return v;
  }
  return nodo;
}

// Camino al refugio alcanzable más cercano siguiendo las distancias del BFS. Lo comparten el movimiento
// (destino y calles restantes) y el endpoint simulado de ruta, así ambos coinciden siempre.
function camino(grafo: Grafo, desde: string, dist: Map<string, number>, bloqueadas: Set<string>, evitar: Set<string>) {
  const ruta = [desde];
  // Cada paso reduce la distancia en uno, así que el recorrido termina dentro de la cantidad de nodos.
  for (let i = 0; i < grafo.nodos.length; i++) {
    const actual = ruta[ruta.length - 1];
    const siguiente = proximoPaso(grafo, actual, dist, bloqueadas, evitar);
    if (siguiente === actual) break;
    ruta.push(siguiente);
  }
  return ruta;
}

function peligroDe(grafo: Grafo, zombies: Zombie[]) {
  const peligro = new Set([...zombies.map((z) => z.nodo), ...nodosBloqueadosPorHordas(grafo, zombies)]);
  for (const r of grafo.refugios) peligro.delete(r.nodo);
  return peligro;
}

function completar(grafo: Grafo, base: Omit<Snapshot, "refugios" | "metricas">): Snapshot {
  const ocupacion = new Map<string, number>();
  for (const s of base.sobrevivientes) {
    if (s.estado === "a_salvo") ocupacion.set(s.nodo, (ocupacion.get(s.nodo) ?? 0) + 1);
  }
  const contar = (estado: Sobreviviente["estado"]) => base.sobrevivientes.filter((s) => s.estado === estado).length;
  return {
    ...base,
    refugios: grafo.refugios.map((r) => ({ id: r.id, ocupacion: ocupacion.get(r.nodo) ?? 0, capacidad: r.capacidad })),
    metricas: { vivos: contar("en_ruta"), aSalvo: contar("a_salvo"), mordidos: contar("mordido"), p95ms: null },
  };
}

export function crearSimulacion(grafo: Grafo, config: ConfigSimulacion, ahora: string): Snapshot {
  const rng = mulberry32(config.semilla);
  const refugios = new Set(grafo.refugios.map((r) => r.nodo));
  const libres = grafo.nodos.map((n) => n.id).filter((id) => !refugios.has(id));

  const zombies: Zombie[] = [];
  const agregar = (tipo: Zombie["tipo"], cantidad: number) => {
    for (let i = 0; i < cantidad; i++) zombies.push({ id: `Z-${String(zombies.length + 1).padStart(3, "0")}`, tipo, nodo: elegir(rng, libres) });
  };
  agregar("caminante", config.caminantes);
  agregar("corredor", config.corredores);
  agregar("horda", config.hordas);

  // Los sobrevivientes arrancan en los cuatro barrios (Tarqui, Los Esteros, Barbasquillo, Jocay) cuando el grafo los tiene.
  const ocupados = new Set(zombies.map((z) => z.nodo));
  const bloqueadosHorda = nodosBloqueadosPorHordas(grafo, zombies);
  const conBarrio = new Set(grafo.nodos.filter((n) => n.barrio).map((n) => n.id));
  const seguro = (id: string) => !ocupados.has(id) && !bloqueadosHorda.has(id);
  const enBarrio = libres.filter((id) => conBarrio.has(id) && seguro(id));
  const inicio = enBarrio.length > 0 ? enBarrio : libres.filter(seguro);
  const sobrevivientes: Sobreviviente[] = Array.from({ length: config.sobrevivientes }, (_, i) => ({
    id: `S-${String(i + 1).padStart(4, "0")}`,
    nodo: elegir(rng, inicio.length > 0 ? inicio : libres),
    estado: "en_ruta",
  }));

  return completar(grafo, { turno: 0, ronda: 3, zombies, aristasBloqueadas: [], sobrevivientes, generadoEn: ahora });
}

export function avanzarTurno(grafo: Grafo, snap: Snapshot, ahora: string, semilla = 0): Snapshot {
  const turno = snap.turno + 1;
  // Semilla + turno: la misma semilla repite la misma ronda; otra semilla juega una distinta.
  const rng = mulberry32(semilla * 100_003 + turno * 7919 + snap.sobrevivientes.length);
  const { adyacencia } = indices(grafo);

  const aristasBloqueadas = [...snap.aristasBloqueadas];
  const evento = EVENTOS_BLOQUEO[turno]?.(grafo);
  if (evento && !aristasBloqueadas.includes(evento)) aristasBloqueadas.push(evento);
  const bloqueadas = new Set(aristasBloqueadas);

  // 1) Primero se mueven los zombies: caminantes cada 2 turnos, corredores 2 calles, las hordas se quedan.
  const zombies = snap.zombies.map((z) => {
    const pasos = z.tipo === "corredor" ? 2 : z.tipo === "caminante" && turno % 2 === 0 ? 1 : 0;
    let nodo = z.nodo;
    for (let i = 0; i < pasos; i++) {
      const opciones = (adyacencia.get(nodo) ?? []).filter((v) => !calleBloqueada(grafo, nodo, v, bloqueadas));
      if (opciones.length > 0) nodo = elegir(rng, opciones);
    }
    return { ...z, nodo };
  });

  // 2) Los sobrevivientes avanzan hacia el refugio más cercano, evitando zombies y zonas de horda.
  const peligro = peligroDe(grafo, zombies);
  const refugioDeNodo = new Map(grafo.refugios.map((r) => [r.nodo, r.id]));
  const dist = distanciaARefugio(grafo, bloqueadas, peligro);
  const zombiesEn = new Set(zombies.map((z) => z.nodo));

  const sobrevivientes = snap.sobrevivientes.map((s): Sobreviviente => {
    if (s.estado !== "en_ruta") return s;
    const nodo = proximoPaso(grafo, s.nodo, dist, bloqueadas, peligro);
    if (refugioDeNodo.has(nodo)) return { id: s.id, nodo, estado: "a_salvo", refugio: refugioDeNodo.get(nodo)! };
    if (zombiesEn.has(nodo)) return { id: s.id, nodo, estado: "mordido" };
    // Destino y calles restantes: campos opcionales de /estado que el simulador real también llena (AGENTS.md §5).
    const ruta = camino(grafo, nodo, dist, bloqueadas, peligro);
    const destino = refugioDeNodo.get(ruta[ruta.length - 1]) ?? null;
    return {
      id: s.id,
      nodo,
      estado: "en_ruta",
      siguienteNodo: ruta[1] ?? nodo,
      refugio: destino,
      callesRestantes: destino ? ruta.length - 1 : undefined,
    };
  });

  return completar(grafo, { turno, ronda: snap.ronda, zombies, aristasBloqueadas, sobrevivientes, generadoEn: ahora });
}

// Simulación de GET /api/sobrevivientes/:id/ruta (K6): la lista de nodos desde el sobreviviente hasta el refugio
// alcanzable más cercano según el snapshot actual. Mismas reglas de evasión que el movimiento simulado de arriba.
export function rutaHaciaRefugio(grafo: Grafo, snap: Snapshot, sobrevivienteId: string): string[] {
  const s = snap.sobrevivientes.find((x) => x.id === sobrevivienteId);
  if (!s || s.estado !== "en_ruta") return [];

  const bloqueadas = new Set(snap.aristasBloqueadas);
  const peligro = peligroDe(grafo, snap.zombies);
  return camino(grafo, s.nodo, distanciaARefugio(grafo, bloqueadas, peligro), bloqueadas, peligro);
}
