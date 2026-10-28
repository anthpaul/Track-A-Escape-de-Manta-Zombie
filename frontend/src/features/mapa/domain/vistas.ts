import { refugiosSinAcceso, vecinos } from "./grafo";
import type { CapaClave, FiltroSobreviviente } from "./panel";
import type { EstadoSobreviviente, Grafo, Snapshot, Sobreviviente } from "./tipos";

// Datos de vista derivados para las pestañas del panel. Son puros, así los conteos de los chips, las capas y las tarjetas
// de refugio se prueban aquí y los componentes solo los renderizan.

const coincide = (grafo: Grafo, s: Sobreviviente, busqueda: string) => {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  const destino = s.refugio ? grafo.refugios.find((r) => r.id === s.refugio)?.nombre ?? "" : "";
  return s.id.toLowerCase().includes(q) || destino.toLowerCase().includes(q);
};

export function filtrarSobrevivientes(
  grafo: Grafo,
  lista: Sobreviviente[],
  busqueda: string,
  filtro: FiltroSobreviviente,
): Sobreviviente[] {
  return lista.filter((s) => coincide(grafo, s, busqueda) && (filtro === "todos" || s.estado === filtro));
}

export function conteosFiltro(grafo: Grafo, lista: Sobreviviente[], busqueda: string): Record<FiltroSobreviviente, number> {
  const conteo: Record<FiltroSobreviviente, number> = { todos: 0, en_ruta: 0, mordido: 0, a_salvo: 0 };
  for (const s of lista) {
    if (!coincide(grafo, s, busqueda)) continue;
    conteo.todos++;
    conteo[s.estado as EstadoSobreviviente]++;
  }
  return conteo;
}

export type RefugioVista = {
  id: string;
  nombre: string;
  ocupacion: number;
  capacidad: number;
  pct: number;
  lleno: boolean;
  enCamino: number;
  accesosBloqueados: number;
  // Nadie puede alcanzarlo en este turno (horda en el acceso o calles bloqueadas): ver refugiosSinAcceso.
  sinAcceso: boolean;
  // Motivo: "horda" cuando lo aíslan las hordas, "calle" cuando ya lo aíslan solo las calles cerradas.
  motivoSinAcceso: "horda" | "calle" | null;
  // Sobrevivientes que vienen hacia aquí y están sobre un zombie visible o junto a él.
  enPeligro: number;
};

export function resumenRefugios(grafo: Grafo, snapshot: Snapshot) {
  const bloqueadas = new Set(snapshot.aristasBloqueadas);
  const cortados = refugiosSinAcceso(grafo, snapshot);
  const cortadosPorCalles = refugiosSinAcceso(grafo, { ...snapshot, zombies: [] });
  const adyacencia = vecinos(grafo);
  const cercaDeZombie = new Set<string>();
  for (const z of snapshot.zombies) {
    if (z.tipo === "dormido") continue;
    cercaDeZombie.add(z.nodo);
    for (const v of adyacencia.get(z.nodo) ?? []) cercaDeZombie.add(v);
  }
  const refugios: RefugioVista[] = grafo.refugios.map((r) => {
    const o = snapshot.refugios.find((x) => x.id === r.id);
    const ocupacion = o?.ocupacion ?? 0;
    const capacidad = o?.capacidad ?? r.capacidad;
    return {
      id: r.id,
      nombre: r.nombre,
      ocupacion,
      capacidad,
      pct: capacidad === 0 ? 100 : Math.min(100, Math.floor((ocupacion * 100) / capacidad)),
      lleno: ocupacion >= capacidad,
      enCamino: snapshot.sobrevivientes.filter((s) => s.estado === "en_ruta" && s.refugio === r.id).length,
      enPeligro: snapshot.sobrevivientes.filter((s) => s.estado === "en_ruta" && s.refugio === r.id && cercaDeZombie.has(s.nodo)).length,
      accesosBloqueados: grafo.calles.filter((c) => bloqueadas.has(c.id) && (c.desde === r.nodo || c.hasta === r.nodo)).length,
      sinAcceso: cortados.has(r.id),
      motivoSinAcceso: !cortados.has(r.id) ? null : cortadosPorCalles.has(r.id) ? "calle" : "horda",
    };
  });
  return {
    aSalvo: refugios.reduce((t, r) => t + r.ocupacion, 0),
    capacidadLibre: refugios.reduce((t, r) => t + Math.max(0, r.capacidad - r.ocupacion), 0),
    refugios,
  };
}

export function conteosCapas(grafo: Grafo, snapshot: Snapshot): Record<CapaClave, number> {
  const zombies = (tipo: string) => snapshot.zombies.filter((z) => z.tipo === tipo).length;
  const personas = (estado: EstadoSobreviviente) => snapshot.sobrevivientes.filter((s) => s.estado === estado).length;
  return {
    caminante: zombies("caminante"),
    corredor: zombies("corredor"),
    horda: zombies("horda"),
    sobreviviente: personas("en_ruta"),
    mordido: personas("mordido"),
    refugio: grafo.refugios.length,
  };
}
