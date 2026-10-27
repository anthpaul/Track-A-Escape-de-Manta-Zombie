import { refugiosSinAcceso } from "./grafo";
import type { CapaClave, FiltroSobreviviente } from "./panel";
import type { EstadoSobreviviente, Grafo, Snapshot, Sobreviviente } from "./tipos";

// Derived view data for the panel tabs. Pure, so the counts shown on chips, layers and shelter
// cards are tested here and the components only render them.

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
  // Nobody can reach it this turn (horde on the way in, or blocked streets): see refugiosSinAcceso.
  sinAcceso: boolean;
};

export function resumenRefugios(grafo: Grafo, snapshot: Snapshot) {
  const bloqueadas = new Set(snapshot.aristasBloqueadas);
  const cortados = refugiosSinAcceso(grafo, snapshot);
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
      accesosBloqueados: grafo.calles.filter((c) => bloqueadas.has(c.id) && (c.desde === r.nodo || c.hasta === r.nodo)).length,
      sinAcceso: cortados.has(r.id),
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
