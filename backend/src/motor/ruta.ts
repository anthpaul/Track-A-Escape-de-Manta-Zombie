/**
 * Full planned route for one survivor — K6, used only by GET /api/sobrevivientes/:id/ruta.
 *
 * It walks buscarRuta step by step over the same frozen world instead of changing
 * the A* that /paso runs, so:
 *   - the first step is exactly what /paso answers for that world (AGENTS.md §4.2);
 *   - /paso keeps its latency, because this runs only when the map asks for a route.
 * Every step reuses the dangers computed once for the world.
 */

import type { MundoTurno } from "./fuente-mundo";
import { buscarRuta, type ContextoGrafo } from "./astar";
import { calcularPeligros } from "./peligros";

export type RutaCompleta =
  | { refugio: string; ruta: string[] }
  | { refugio: null; ruta: [string]; motivo: "sin_ruta" };

export function calcularRutaCompleta(
  nodoActual: string,
  contexto: ContextoGrafo,
  mundo: Pick<MundoTurno, "zombies" | "aristasBloqueadas">,
): RutaCompleta {
  const peligros = calcularPeligros(mundo, contexto.indexado);
  const ruta = [nodoActual];
  const visitados = new Set(ruta);
  let refugio: string | null = null;

  // A simple path never has more nodes than the graph, so this always ends.
  for (let i = 0; i < contexto.coordenadas.size; i++) {
    const paso = buscarRuta(ruta[ruta.length - 1], contexto, mundo, peligros);
    if (paso.tipo === "ya_en_refugio") return { refugio: paso.refugio, ruta };
    if (paso.tipo === "sin_ruta") break;
    refugio = paso.refugio;
    if (visitados.has(paso.siguienteNodo)) break; // defensive: never draw a loop
    visitados.add(paso.siguienteNodo);
    ruta.push(paso.siguienteNodo);
  }

  return refugio !== null && ruta.length > 1 ? { refugio, ruta } : { refugio: null, ruta: [nodoActual], motivo: "sin_ruta" };
}
