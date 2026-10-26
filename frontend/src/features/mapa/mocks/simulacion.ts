import type { Grafo, Snapshot, Sobreviviente, Zombie } from "../tipos";
import { nodosBloqueadosPorHordas, vecinos } from "../vivo";

// Fake /api/estado for building the map before the real simulator exists (S1–S5).
// Simplified rules, NOT the official ones: the real simulator lives in tools/simulador/.

export type ConfigSimulacion = {
  sobrevivientes: number;
  caminantes: number;
  corredores: number;
  hordas: number;
  semilla: number;
};

// Turns at which a mock city event blocks a street (R2/R3-like).
const EVENTOS_BLOQUEO: Record<number, (g: Grafo) => string | undefined> = {
  8: (g) => g.calles.find((c) => c.tipo === "puente")?.id,
  16: (g) => g.calles.find((c) => c.tipo === "avenida")?.id,
};

// Small deterministic PRNG so the same seed always replays the same round.
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

function calleEntre(grafo: Grafo, a: string, b: string) {
  return grafo.calles.find((c) => (c.desde === a && c.hasta === b) || (c.desde === b && c.hasta === a));
}

// Multi-source BFS from every shelter over open streets: distance to the nearest shelter per node.
function distanciaARefugio(grafo: Grafo, bloqueadas: Set<string>, evitar: Set<string>): Map<string, number> {
  const adyacencia = vecinos(grafo);
  const dist = new Map<string, number>();
  const cola = grafo.refugios.map((r) => r.nodo);
  for (const n of cola) dist.set(n, 0);
  while (cola.length > 0) {
    const actual = cola.shift()!;
    for (const v of adyacencia.get(actual) ?? []) {
      if (dist.has(v) || evitar.has(v)) continue;
      if (bloqueadas.has(calleEntre(grafo, actual, v)?.id ?? "")) continue;
      dist.set(v, dist.get(actual)! + 1);
      cola.push(v);
    }
  }
  return dist;
}

function proximoPaso(grafo: Grafo, nodo: string, dist: Map<string, number>, bloqueadas: Set<string>, evitar: Set<string>) {
  const propia = dist.get(nodo);
  if (propia === undefined || propia === 0) return nodo;
  for (const v of vecinos(grafo).get(nodo) ?? []) {
    if (evitar.has(v) || bloqueadas.has(calleEntre(grafo, nodo, v)?.id ?? "")) continue;
    if (dist.get(v) === propia - 1) return v;
  }
  return nodo;
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

  const ocupados = new Set(zombies.map((z) => z.nodo));
  const inicio = libres.filter((id) => !ocupados.has(id) && !nodosBloqueadosPorHordas(grafo, zombies).has(id));
  const sobrevivientes: Sobreviviente[] = Array.from({ length: config.sobrevivientes }, (_, i) => ({
    id: `S-${String(i + 1).padStart(4, "0")}`,
    nodo: elegir(rng, inicio.length > 0 ? inicio : libres),
    estado: "en_ruta",
  }));

  return completar(grafo, { turno: 0, ronda: 3, zombies, aristasBloqueadas: [], sobrevivientes, generadoEn: ahora });
}

export function avanzarTurno(grafo: Grafo, snap: Snapshot, ahora: string, semilla = 0): Snapshot {
  const turno = snap.turno + 1;
  // Seed + turn: the same seed replays the same round, a different seed plays a different one.
  const rng = mulberry32(semilla * 100_003 + turno * 7919 + snap.sobrevivientes.length);
  const adyacencia = vecinos(grafo);

  const aristasBloqueadas = [...snap.aristasBloqueadas];
  const evento = EVENTOS_BLOQUEO[turno]?.(grafo);
  if (evento && !aristasBloqueadas.includes(evento)) aristasBloqueadas.push(evento);
  const bloqueadas = new Set(aristasBloqueadas);

  // 1) Zombies move first: walkers every 2 turns, runners 2 streets, hordes stay.
  const zombies = snap.zombies.map((z) => {
    const pasos = z.tipo === "corredor" ? 2 : z.tipo === "caminante" && turno % 2 === 0 ? 1 : 0;
    let nodo = z.nodo;
    for (let i = 0; i < pasos; i++) {
      const opciones = (adyacencia.get(nodo) ?? []).filter((v) => !bloqueadas.has(calleEntre(grafo, nodo, v)?.id ?? ""));
      if (opciones.length > 0) nodo = elegir(rng, opciones);
    }
    return { ...z, nodo };
  });

  // 2) Survivors step toward the nearest shelter, avoiding zombies and horde zones.
  const peligro = new Set([...zombies.map((z) => z.nodo), ...nodosBloqueadosPorHordas(grafo, zombies)]);
  const refugios = new Set(grafo.refugios.map((r) => r.nodo));
  for (const r of refugios) peligro.delete(r);
  const dist = distanciaARefugio(grafo, bloqueadas, peligro);
  const zombiesEn = new Set(zombies.map((z) => z.nodo));

  const sobrevivientes = snap.sobrevivientes.map((s): Sobreviviente => {
    if (s.estado !== "en_ruta") return s;
    const nodo = proximoPaso(grafo, s.nodo, dist, bloqueadas, peligro);
    if (refugios.has(nodo)) return { id: s.id, nodo, estado: "a_salvo" };
    if (zombiesEn.has(nodo)) return { id: s.id, nodo, estado: "mordido" };
    return { id: s.id, nodo, estado: "en_ruta", siguienteNodo: proximoPaso(grafo, nodo, dist, bloqueadas, peligro) };
  });

  return completar(grafo, { turno, ronda: snap.ronda, zombies, aristasBloqueadas, sobrevivientes, generadoEn: ahora });
}

// Mock of GET /api/sobrevivientes/:id/ruta (K6): the node list from the survivor to the nearest
// reachable shelter under the current snapshot. Same avoidance rules as the mock movement above.
export function rutaHaciaRefugio(grafo: Grafo, snap: Snapshot, sobrevivienteId: string): string[] {
  const s = snap.sobrevivientes.find((x) => x.id === sobrevivienteId);
  if (!s || s.estado !== "en_ruta") return [];

  const bloqueadas = new Set(snap.aristasBloqueadas);
  const peligro = new Set([...snap.zombies.map((z) => z.nodo), ...nodosBloqueadosPorHordas(grafo, snap.zombies)]);
  for (const r of grafo.refugios) peligro.delete(r.nodo);
  const dist = distanciaARefugio(grafo, bloqueadas, peligro);

  const ruta = [s.nodo];
  // Each step lowers the distance by one, so the walk ends within the node count.
  for (let i = 0; i < grafo.nodos.length; i++) {
    const actual = ruta[ruta.length - 1];
    const siguiente = proximoPaso(grafo, actual, dist, bloqueadas, peligro);
    if (siguiente === actual) break;
    ruta.push(siguiente);
  }
  return ruta;
}
