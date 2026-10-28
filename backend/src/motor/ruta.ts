/**
 * Ruta planificada completa de un sobreviviente (K6); solo la usa GET /api/sobrevivientes/:id/ruta.
 *
 * Recorre `buscarRuta` paso a paso sobre el mismo mundo congelado, en lugar de modificar
 * el A* que ejecuta /paso. Así:
 *   - el primer paso es exactamente lo que /paso responde para ese mundo (AGENTS.md §4.2);
 *   - /paso conserva su latencia, porque esto solo corre cuando el mapa pide una ruta.
 * Cada paso reutiliza los peligros calculados una sola vez para el mundo.
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
  // Capacidad de refugios (Pro): los mismos refugios permitidos que /paso usa para este sobreviviente (cupos.ts).
  refugiosPermitidos?: ReadonlySet<string>,
): RutaCompleta {
  const peligros = calcularPeligros(mundo, contexto.indexado);
  const ruta = [nodoActual];
  const visitados = new Set(ruta);
  let refugio: string | null = null;

  // Un camino simple nunca tiene más nodos que el grafo, así que este ciclo siempre termina.
  for (let i = 0; i < contexto.coordenadas.size; i++) {
    const paso = buscarRuta(ruta[ruta.length - 1], contexto, mundo, peligros, refugiosPermitidos);
    if (paso.tipo === "ya_en_refugio") return { refugio: paso.refugio, ruta };
    if (paso.tipo === "sin_ruta") break;
    refugio = paso.refugio;
    if (visitados.has(paso.siguienteNodo)) break; // defensivo: nunca dibujar un ciclo
    visitados.add(paso.siguienteNodo);
    ruta.push(paso.siguienteNodo);
  }

  return refugio !== null && ruta.length > 1 ? { refugio, ruta } : { refugio: null, ruta: [nodoActual], motivo: "sin_ruta" };
}
