/**
 * Coordinador de turnos — S1 + S2 + S3.
 *
 * Implementa la secuencia exacta de AGENTS.md §4.5:
 *
 *   Paso 1  Despierta a los zombies dormidos y después mueve a todos los zombies.
 *   Paso 2  Aplica los bloqueos por eventos de ciudad de este turno.
 *   Paso 3  Escribe TURNO#N con completo = false.
 *   Paso 4  Llama a POST /paso por cada sobreviviente activo, todos en una misma ventana concurrente.
 *   Paso 5  Valida cada respuesta; ante timeout o error, el sobreviviente se queda quieto.
 *   Paso 6  Mueve a los sobrevivientes, resuelve mordidas (nodo + cruce), revisa llegadas
 *           y escribe completo = true.
 *
 * Los turnos nunca se superponen: al final se llama a esperarTick para completar la ventana
 * de 2 segundos, y el turno N+1 no arranca hasta que termina el UpdateItem del turno N.
 *
 * La configuración de la ronda limita la población a 200 sobrevivientes como máximo.
 * Con lotes secuenciales, 200 timeouts convertirían el turno en uno de cinco segundos;
 * por eso cada pedido tiene su propio límite concurrente de 500 ms y su señal de aborto.
 */
import type { GrafoIndexado, Zombie, Sobreviviente } from "@abcstack/shared";
import type { Vehiculo } from "@abcstack/shared";
import {
  despertarDormidos,
  moverZombie,
  resolverMordidasPorNodo,
  resolverMordidasPorCruce,
  resolverLlegadas,
  moverFlota,
  zombiesVisibles,
  aplicarBloqueo,
} from "@abcstack/shared";
import type { ZombieInterno } from "@abcstack/shared";
import type { ClienteMotor } from "./motor-falso";
import type { PersistenciaPartida, TurnoParcial } from "./persistencia";
import type { Reloj } from "./reloj";

// -------------------------------------------------------------------------
// Constantes
// -------------------------------------------------------------------------

const DURACION_TURNO_MS = 2_000;
const PASO_TIMEOUT_MS = 500;

// -------------------------------------------------------------------------
// Tipos
// -------------------------------------------------------------------------

export interface EventoRonda {
  /** Número de turno en el que el bloqueo entra en vigor. */
  turno: number;
  /** Id de la calle a bloquear (AGENTS.md §0 — eventos de ciudad). */
  calleId: string;
  /** Etiqueta legible para los logs (por ejemplo "bridge collapse R2"). */
  descripcion?: string;
}

export interface ConfigTurno {
  /** Grafo indexado (para validar movimientos). */
  grafo: GrafoIndexado;
  /** Estado actual de los zombies (mutable entre turnos), dormidos incluidos. */
  zombies: ZombieInterno[];
  /** Estado actual de los sobrevivientes (mutable entre turnos). */
  sobrevivientes: Sobreviviente[];
  /** Ids de las calles bloqueadas en este momento (por ejemplo, por colapso de un puente). */
  aristasBloqueadas: string[];
  /** Cliente del motor (real o falso). */
  motor: ClienteMotor;
  /** Capa de persistencia (en memoria o DynamoDB). */
  persistencia: PersistenciaPartida;
  /** Reloj controlable. */
  reloj: Reloj;
  /** Id de partición único de esta ronda (por ejemplo "demo-r1-1793030400000"). */
  partidaId: string;
  /** Número de ronda (1 | 2 | 3). */
  ronda: 1 | 2 | 3;
  /** Conjunto de ids de nodos de refugio: los sobrevivientes que llegan acá pasan a "a_salvo". */
  nodosRefugio: ReadonlySet<string>;
  /** Nodo de refugio → capacidad (Pro). Un refugio lleno no admite a nadie más; sin este dato entran todos los que llegan. */
  capacidadRefugio?: ReadonlyMap<string, number>;
  /** Flota de rescate (Pro, shared/flota.ts). Solo en rondas de demo: las de evaluación no tienen. */
  flota?: Vehiculo[];
  /** Generador de números aleatorios con semilla, inyectado para que sea reproducible. */
  aleatorio: () => number;
  /** Eventos de ciudad programados, aplicados en su turno asignado (Paso 2). */
  eventos?: readonly EventoRonda[];
  /**
   * Próximo paso planificado de un sobreviviente desde su nodo actual. Cuando está definido (rondas
   * de demo en proceso), el turno completo lo publica como siguienteNodo para que el mapa dibuje la
   * flecha de cada sobreviviente; sin él (rondas HTTP, donde planificar costaría una llamada extra a
   * /paso), siguienteNodo es el paso que se acaba de dar.
   */
  planificarSiguiente?: (sobreviviente: Sobreviviente) => string;
}

/** Resumen que se devuelve después de cada turno, para métricas y logs. */
export interface ResultadoTurno {
  turno: number;
  respuestasValidas: number;
  respuestasFallidas: number;   // timeout, error HTTP o movimiento inválido
  /** Personas que la flota de rescate llevó a un refugio este turno (rondas con flota). */
  rescatadosFlota?: number;
  enRuta: number;
  aSalvo: number;
  mordidos: number;
  duracionMs: number;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------


// -------------------------------------------------------------------------
// Núcleo: avanzar un turno
// -------------------------------------------------------------------------

/**
 * Avanza el mundo exactamente un turno.
 *
 * `config.zombies` y `config.sobrevivientes` se modifican en el lugar, así los
 * arreglos de quien llama quedan al día sin volver a leer de la persistencia.
 *
 * @param config  Estado mutable compartido del mundo + dependencias inyectadas.
 * @param turno   Número de turno a ejecutar (empieza en 1, después de preparar el turno cero).
 */
export async function ejecutarTurno(
  config: ConfigTurno,
  turno: number,
): Promise<ResultadoTurno> {
  const iniciado = config.reloj.ahora();

  // -----------------------------------------------------------
  // Paso 1: despierta a los dormidos y después mueve a todos los zombies.
  // -----------------------------------------------------------
  despertarDormidos(config.zombies, config.sobrevivientes, config.grafo);

  // Guarda las posiciones de los zombies ANTES de moverlos (hace falta para detectar mordidas por cruce).
  const previoZombies = config.zombies.map((z) => ({ id: z.id, nodo: z.nodo, tipo: z.tipo }));

  for (const zombie of config.zombies) {
    const { nuevoNodo, movioPasadoTurno } = moverZombie(
      zombie,
      config.grafo,
      config.aristasBloqueadas,
      config.sobrevivientes,
      config.aleatorio,
      turno,
    );
    zombie.nodo = nuevoNodo;
    zombie.movioPasadoTurno = movioPasadoTurno;
  }

  // -----------------------------------------------------------
  // Paso 2: aplica los eventos de ciudad programados para este turno.
  // -----------------------------------------------------------
  if (config.eventos) {
    for (const evento of config.eventos) {
      if (evento.turno === turno) {
        config.aristasBloqueadas = aplicarBloqueo(config.aristasBloqueadas, evento.calleId);
        if (evento.descripcion) {
          console.log(`[turno ${turno}] Evento: ${evento.descripcion} (${evento.calleId})`);
        }
      }
    }
  }

  // -----------------------------------------------------------
  // Paso 3: escribe TURNO#N con completo = false.
  // -----------------------------------------------------------
  const sobrevivientesAntesDeMoverse: Sobreviviente[] = config.sobrevivientes.map(
    (s) => ({ ...s }),
  );
  const zombiesActuales: Zombie[] = config.zombies.map((z) => ({ ...z }));

  const parcial: TurnoParcial = {
    turno,
    zombies: zombiesVisibles(zombiesActuales),
    aristasBloqueadas: [...config.aristasBloqueadas],
    sobrevivientes: sobrevivientesAntesDeMoverse,
  };
  await config.persistencia.guardarTurnoIncompleto(parcial);

  // -----------------------------------------------------------
  // Pasos 4 + 5: consulta al motor por cada sobreviviente activo.
  //
  // Solo se llama a /paso por los sobrevivientes que siguen "en_ruta".
  // Cada llamada tiene un límite estricto de 500 ms; cualquier timeout o error
  // cuenta como "quedarse quieto" (el sobreviviente no se mueve ese turno).
  // -----------------------------------------------------------
  // Quienes viajan en una camioneta de rescate se mueven con ella: nunca consultan /paso.
  const activos = config.sobrevivientes.filter((s) => s.estado === "en_ruta" && !s.vehiculo);
  let respuestasValidas = 0;
  let respuestasFallidas = 0;

  const decisiones = new Map<string, string>();

  const consultarMotor = async (sobreviviente: Sobreviviente): Promise<void> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const respuesta = await Promise.race([
        config.motor.pedirPaso({
          sobrevivienteId: sobreviviente.id,
          nodoActual: sobreviviente.nodo,
          turno,
        }, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, PASO_TIMEOUT_MS);
        }),
      ]);

      // Valida: debe ser el mismo nodo o un vecino por una calle no bloqueada.
      const esValido = config.grafo.esMovimientoValido(
        sobreviviente.nodo,
        respuesta.siguienteNodo,
        config.aristasBloqueadas,
      );

      if (esValido) {
        decisiones.set(sobreviviente.id, respuesta.siguienteNodo);
        respuestasValidas++;
      } else {
        // Movimiento inválido → se queda quieto.
        decisiones.set(sobreviviente.id, sobreviviente.nodo);
        respuestasFallidas++;
      }
    } catch {
      // Timeout o error de red → se queda quieto.
      decisiones.set(sobreviviente.id, sobreviviente.nodo);
      respuestasFallidas++;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  await Promise.all(activos.map(consultarMotor));

  // -----------------------------------------------------------
  // Paso 6: mueve a los sobrevivientes, resuelve mordidas, revisa llegadas y escribe completo = true.
  // -----------------------------------------------------------
  // Guarda las posiciones de los sobrevivientes ANTES de moverlos (para detectar mordidas por cruce).
  const previoSobrevivientes = config.sobrevivientes.map((s) => ({ id: s.id, nodo: s.nodo }));

  // Aplica los movimientos.
  for (const sobreviviente of config.sobrevivientes) {
    if (sobreviviente.estado !== "en_ruta" || sobreviviente.vehiculo) continue;
    const siguienteNodo = decisiones.get(sobreviviente.id) ?? sobreviviente.nodo;
    sobreviviente.nodo = siguienteNodo;
    sobreviviente.siguienteNodo = siguienteNodo;
  }

  // Resuelve las mordidas (primero por nodo compartido, después por cruce).
  resolverMordidasPorNodo(config.sobrevivientes, config.zombies);
  resolverMordidasPorCruce(
    config.sobrevivientes,
    previoSobrevivientes,
    config.zombies,
    previoZombies,
    config.grafo,
  );

  // Revisa las llegadas a refugios (después de las mordidas: un mordido en un refugio queda mordido).
  resolverLlegadas(config.sobrevivientes, config.nodosRefugio, config.capacidadRefugio);

  // Flota de rescate (Pro): las camionetas se mueven después de todos los que van a pie, recogen gente y la dejan en los refugios.
  let rescatadosFlota: number | undefined;
  if (config.flota) {
    const eventos = moverFlota(config.flota, {
      grafo: config.grafo,
      sobrevivientes: config.sobrevivientes,
      zombies: zombiesVisibles(config.zombies),
      aristasBloqueadas: config.aristasBloqueadas,
      nodosRefugio: config.nodosRefugio,
      capacidadRefugio: config.capacidadRefugio,
    });
    rescatadosFlota = eventos.filter((e) => e.tipo === "dejo").reduce((t, e) => t + e.sobrevivientes.length, 0);
  }

  // Solo los sobrevivientes que siguen en ruta reciben un siguiente paso; los movimientos, mordidas y llegadas de arriba no cambian.
  let publicadas = decisiones;
  const planificar = config.planificarSiguiente;
  if (planificar) {
    publicadas = new Map(decisiones);
    for (const sobreviviente of config.sobrevivientes) {
      if (sobreviviente.estado !== "en_ruta") continue;
      // El siguiente paso de un pasajero es a donde vaya la camioneta: no tiene flecha propia.
      sobreviviente.siguienteNodo = sobreviviente.vehiculo ? sobreviviente.nodo : planificar(sobreviviente);
      publicadas.set(sobreviviente.id, sobreviviente.siguienteNodo);
    }
  }

  await config.persistencia.completarTurno(turno, publicadas, config.sobrevivientes, config.flota);

  // -----------------------------------------------------------
  // Espera hasta completar la ventana del tick.
  // -----------------------------------------------------------
  await config.reloj.esperarTick(iniciado, DURACION_TURNO_MS);

  const duracionMs = config.reloj.ahora() - iniciado;

  return {
    turno,
    respuestasValidas,
    respuestasFallidas,
    ...(rescatadosFlota !== undefined && { rescatadosFlota }),
    enRuta: config.sobrevivientes.filter((s) => s.estado === "en_ruta").length,
    aSalvo: config.sobrevivientes.filter((s) => s.estado === "a_salvo").length,
    mordidos: config.sobrevivientes.filter((s) => s.estado === "mordido").length,
    duracionMs,
  };
}

// -------------------------------------------------------------------------
// Ejecutor de la ronda
// -------------------------------------------------------------------------

export interface ConfigRonda extends ConfigTurno {
  /** Por defecto true para quienes ya lo llaman en local; los escenarios oficiales juegan los 150 turnos. */
  detenerSinActivos?: boolean;
  /** Cantidad total de turnos a ejecutar (por ejemplo 150 para una ronda de 5 minutos a 2 s por turno). */
  totalTurnos: number;
  /** Callback opcional que se invoca al completar cada turno (para logs y métricas). */
  onTurno?: (resultado: ResultadoTurno) => void;
  /** Señal de aborto opcional: se revisa en cada turno para terminar antes. */
  signal?: AbortSignal;
}

/**
 * Juega una ronda completa desde el turno 1 hasta `totalTurnos`.
 * Devuelve un arreglo de ResultadoTurno, uno por cada turno ejecutado.
 */
export async function correrRonda(config: ConfigRonda): Promise<ResultadoTurno[]> {
  const resultados: ResultadoTurno[] = [];

  for (let n = 1; n <= config.totalTurnos; n++) {
    if (config.signal?.aborted) break;

    const resultado = await ejecutarTurno(config, n);
    resultados.push(resultado);
    config.onTurno?.(resultado);

    // Termina antes cuando ya nadie se está moviendo.
    if (resultado.enRuta === 0 && config.detenerSinActivos !== false) break;
  }

  return resultados;
}
