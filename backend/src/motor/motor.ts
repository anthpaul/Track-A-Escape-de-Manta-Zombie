/**
 * Singleton del motor: se carga una sola vez por instancia caliente de Lambda (AGENTS.md §4.3).
 *
 * Responsabilidades:
 *   1. Parsear e indexar el grafo estático de shared/data/manta.json.
 *   2. Construir el contexto de ruteo del A* (coordenadas + refugios).
 *   3. Exponer calcularSiguienteNodo, la única función que llama /paso.
 *
 * Lo que este módulo NO hace:
 *   - Leer DynamoDB (eso le corresponde a FuenteMundo).
 *   - Elegir qué partición está activa (eso le corresponde a la ruta /paso).
 *   - Escribir nada (AGENTS.md §4.2: /paso nunca escribe en DynamoDB).
 */

import { crearGrafo, type Grafo } from "@abcstack/shared";
// esbuild empaqueta manta.json junto con handler.js; nunca se descarga en tiempo de ejecución.
import grafoData from "@abcstack/shared/data/manta.json";
import { buscarRuta, crearContextoGrafo, type ContextoGrafo, type ResultadoBusqueda } from "./astar";
import { asignarCupos } from "./cupos";
import { calcularPeligros } from "./peligros";
import { elegirEscape } from "./evasion";
import type { MundoTurno } from "./fuente-mundo";

// ---------------------------------------------------------------------------
// Inicialización única (fuera del handler: sobrevive entre invocaciones en caliente)
// ---------------------------------------------------------------------------

const grafoIndexado = crearGrafo(grafoData);
const contexto: ContextoGrafo = crearContextoGrafo(grafoData as Grafo, grafoIndexado);

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface EntradaMotor {
  sobrevivienteId: string;
  nodoActual: string;
  mundo: MundoTurno;
}

export interface SalidaMotor {
  siguienteNodo: string;
  resultado: ResultadoBusqueda;
}

/**
 * Calcula el siguiente nodo de un sobreviviente según el estado actual del mundo.
 *
 * Acepta un `peligrosDelTurno` precalculado (opcional) para que el handler de la
 * ruta pueda llamar a calcularPeligros una vez por turno y pasarlo a cada
 * sobreviviente, sin recalcular lo mismo para el mismo snapshot del mundo.
 *
 * Nunca lanza errores. Si no hay refugio alcanzable, escapa a la opción legal más
 * lejana de los zombies que se mueven, que puede ser quedarse quieto (AGENTS.md §4.3, regla 2).
 */
export function calcularSiguienteNodo(
  entrada: EntradaMotor,
  peligrosDelTurno?: ReturnType<typeof calcularPeligros>,
): SalidaMotor {
  const peligros = peligrosDelTurno ?? calcularPeligros(entrada.mundo, contexto.indexado);
  // Capacidad de refugios (Pro): ir solo adonde este sobreviviente tiene lugar; si ninguno de esos es
  // alcanzable en este turno, a cualquier refugio con espacio; recién entonces, escapar.
  const cupos = asignarCupos(contexto, entrada.mundo);
  let resultado = buscarRuta(entrada.nodoActual, contexto, entrada.mundo, peligros, cupos?.refugiosPara(entrada.sobrevivienteId));
  if (resultado.tipo === "sin_ruta" && cupos && cupos.conLugar.size > 0) {
    resultado = buscarRuta(entrada.nodoActual, contexto, entrada.mundo, peligros, cupos.conLugar);
  }

  let siguienteNodo: string;
  switch (resultado.tipo) {
    case "movimiento":
      siguienteNodo = resultado.siguienteNodo;
      break;
    case "ya_en_refugio":
      siguienteNodo = entrada.nodoActual;
      break;
    case "sin_ruta":
      // Esperar al lado de un zombie hace que muerdan al sobreviviente: mejor alejarse.
      siguienteNodo = elegirEscape(entrada.nodoActual, contexto, entrada.mundo, peligros);
      break;
  }

  return { siguienteNodo, resultado };
}

/**
 * Expuesto para la ruta /paso: precalcula los conjuntos de peligro una vez por
 * snapshot de turno, antes de recorrer los sobrevivientes.
 */
export { calcularPeligros as calcularPeligrosDelTurno };

/** Expuesto para los tests: el contexto de ruteo ya construido. */
export { contexto as contextoGrafo };
