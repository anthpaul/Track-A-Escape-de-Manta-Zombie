/**
 * Lambda del simulador — una ronda por invocación: demos programadas (S6, AGENTS.md §2) y las
 * rondas de evaluación de la prueba de fuego.
 *
 * EventBridge Scheduler la invoca cada pocos minutos para que el mapa público nunca quede
 * congelado (trampa del jurado). Cada invocación juega una ronda completa de 5 minutos y escribe
 * cada turno en DynamoDB con el mismo lock y la misma protección que `correr.ts --modo=http`:
 * si otra ronda tiene el lock (una evaluación, o una demo anterior que sigue corriendo),
 * sale sin escribir nada más.
 *
 * Evento (todo opcional): { "ronda": 1 | 2 | 3, "semilla": number, "modo": "demo" | "evaluacion", "flota": boolean }.
 * La flota de rescate (Pro) va por defecto en las rondas de demo y nunca en evaluación salvo que se pida.
 *
 * Las rondas de demo se encadenan: cuando una termina (a menudo antes de tiempo, cuando ya no queda
 * nadie en ruta), la misma invocación arranca la siguiente de inmediato mientras le quede tiempo para
 * una ronda completa; así el mapa público espera ~2 s entre rondas en lugar de hasta un minuto por la
 * siguiente programación. Las rondas de evaluación nunca se encadenan.
 * La demo por defecto es la R2, la ronda que muestra todos los tipos de zombie salvo los dormidos,
 * además del colapso de un puente.
 *
 * El modo evaluación (`aws lambda invoke` con "modo": "evaluacion") llama al POST /paso real por
 * HTTP desde la misma región, así la latencia medida es la del servicio y no la de la conexión a
 * internet del operador. Primero calienta la Lambda de la API (oleadas simultáneas tan grandes como
 * la ronda, con un motor propio para que esas latencias nunca se mezclen con las de la ronda), juega
 * los 150 turnos y devuelve las oleadas de warm-up y las métricas de la ronda. Los pedidos de warm-up
 * esperan hasta 3 s: una instancia nueva de la API necesita más de 500 ms para arrancar y abrir su
 * conexión a DynamoDB, y cortarla antes solo hace que la siguiente oleada pida otra instancia en frío.
 *
 * Entorno: MUNDO_TABLE; PASO_URL y PASO_KEY para las rondas de evaluación.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { crearEscenarioR1, crearEscenarioR2, crearEscenarioR3 } from "./escenarios";
import { DynamoPersistencia, type ClienteEscritura } from "./dynamo-persistencia";
import { crearMotorEnProceso, siguientePasoEnProceso } from "./motor-en-proceso";
import { correrRonda, type ConfigRonda, type ResultadoTurno } from "./turno";
import { relojReal, type Reloj } from "./reloj";
import { MotorHttp, type OpcionesMotorHttp } from "./motor-http";
import { calentar, type ResultadoOleada } from "./calentar";
import { calcularMetricas, p95DeLatencias, type MetricasRonda } from "./metricas";
import type { ClienteMotor } from "./motor-falso";

export type EventoDemo = { ronda?: unknown; semilla?: unknown; modo?: unknown; flota?: unknown };
export type Modo = "demo" | "evaluacion";
export type ResultadoDemo =
  | { iniciada: false }
  | {
      iniciada: true;
      partidaId: string;
      ronda: 1 | 2 | 3;
      modo: Modo;
      aSalvo: number;
      mordidos: number;
      enRuta: number;
      // Rondas que jugó esta invocación (las de demo se encadenan; el resultado describe la última).
      rondasJugadas?: number;
      // Solo en rondas con flota de rescate.
      rescatadosFlota?: number;
      // Solo en rondas de evaluación.
      calentamiento?: ResultadoOleada[];
      metricas?: MetricasRonda;
    };

/** El motor HTTP de una ronda de evaluación: responde /paso y registra una latencia por llamada. */
export type MotorMedido = ClienteMotor & { readonly latencias: number[] };

export function parseEvento(evento: EventoDemo | null | undefined): { ronda: 1 | 2 | 3; semilla: number; modo: Modo; flota: boolean } {
  const ronda = evento?.ronda ?? 2;
  if (ronda !== 1 && ronda !== 2 && ronda !== 3) throw new Error("ronda must be 1, 2 or 3");
  const semilla = evento?.semilla ?? Math.floor(Math.random() * 0xffffffff);
  if (typeof semilla !== "number" || !Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    throw new Error("semilla must be an integer between 0 and 4294967295");
  }
  const modo = evento?.modo ?? "demo";
  if (modo !== "demo" && modo !== "evaluacion") throw new Error("modo must be 'demo' or 'evaluacion'");
  const flota = evento?.flota ?? modo === "demo";
  if (typeof flota !== "boolean") throw new Error("flota must be true or false");
  return { ronda, semilla, modo, flota };
}

export function crearHandler(deps: {
  cliente: ClienteEscritura;
  tabla: string;
  reloj?: Reloj;
  // Rondas de evaluación: una llamada por motor (la ronda y después el warm-up). Por defecto, POST /paso con PASO_URL / PASO_KEY.
  crearMotorHttp?: (opciones?: Pick<OpcionesMotorHttp, "timeoutMs">) => MotorMedido;
  pausaCalentamientoMs?: number;
  // Milisegundos que le quedan a esta invocación (contexto de Lambda). Sin este dato, las rondas de demo no se encadenan.
  tiempoRestanteMs?: () => number;
}) {
  const jugar = async (ronda: 1 | 2 | 3, semilla: number, modo: Modo, flota: boolean): Promise<ResultadoDemo> => {
    const crear = ronda === 1 ? crearEscenarioR1 : ronda === 2 ? crearEscenarioR2 : crearEscenarioR3;
    const crearMotorHttp = deps.crearMotorHttp ?? ((opciones) => new MotorHttp(opciones));
    // Se construye antes de escribir nada, así una PASO_URL / PASO_KEY faltante falla sin tocar el lock.
    const motorHttp = modo === "evaluacion" ? crearMotorHttp() : undefined;
    // El motor de demo lee la configuración viva de la ronda, que solo existe una vez construido el escenario.
    let vivo: ConfigRonda | undefined;
    const motor =
      motorHttp ??
      crearMotorEnProceso(() => vivo?.zombies ?? [], () => vivo?.aristasBloqueadas ?? [], () => vivo?.sobrevivientes ?? []);
    const escenario = crear({ semilla, motor, reloj: deps.reloj ?? relojReal, modo, flota });
    const { config } = escenario;
    vivo = config;
    // Publica el siguiente paso de cada sobreviviente para que el mapa dibuje su flecha; acá no cuesta nada porque el motor corre en proceso.
    config.planificarSiguiente = (s) =>
      siguientePasoEnProceso(
        { sobrevivienteId: s.id, nodoActual: s.nodo, turno: 0 },
        config.zombies,
        config.aristasBloqueadas,
        config.sobrevivientes,
      );

    const persistencia = new DynamoPersistencia(deps.cliente, deps.tabla, config.partidaId, ronda);
    // El panel del mapa muestra el p95 en vivo de /paso en las rondas de evaluación (AGENTS.md §5 metricas.p95ms).
    if (motorHttp) persistencia.medirP95 = () => p95DeLatencias(motorHttp.latencias);
    if (!(await persistencia.iniciar(semilla))) return { iniciada: false };
    config.persistencia = persistencia;

    // Turno de llegada de cada sobreviviente y el resultado de cada turno, para las métricas de eficiencia y errores.
    const llegadas = new Map<string, number>();
    const turnos: ResultadoTurno[] = [];
    let rescatadosFlota = 0;
    config.onTurno = (resultado) => {
      turnos.push(resultado);
      rescatadosFlota += resultado.rescatadosFlota ?? 0;
      for (const s of config.sobrevivientes) if (s.estado === "a_salvo" && !llegadas.has(s.id)) llegadas.set(s.id, resultado.turno);
    };

    let calentamiento: ResultadoOleada[] | undefined;
    try {
      if (motorHttp) {
        // Despierta tantas instancias de la API como la ronda va a usar a la vez, antes de que cuente el turno 1.
        calentamiento = await calentar({
          motor: crearMotorHttp({ timeoutMs: 3000 }),
          concurrencia: config.sobrevivientes.length,
          oleadas: 4,
          pausaMs: deps.pausaCalentamientoMs ?? 2000,
          nodo: config.sobrevivientes[0]!.nodo,
        });
      }
      await correrRonda(config);
    } finally {
      await persistencia.cerrar();
    }

    const contar = (estado: string) => config.sobrevivientes.filter((s) => s.estado === estado).length;
    const base = {
      iniciada: true as const,
      partidaId: config.partidaId,
      ronda,
      modo,
      aSalvo: contar("a_salvo"),
      mordidos: contar("mordido"),
      enRuta: contar("en_ruta"),
      ...(flota && { rescatadosFlota }),
    };
    if (!motorHttp) return base;

    for (const dato of escenario.datosIniciales) {
      dato.turnoLlegada = llegadas.get(dato.id) ?? 0;
      const s = config.sobrevivientes.find((x) => x.id === dato.id);
      if (s) dato.estado = s.estado;
    }
    const metricas = calcularMetricas({
      ronda,
      resultadosTurnos: turnos,
      latencias: motorHttp.latencias,
      sobrevivientes: config.sobrevivientes,
      datosIniciales: escenario.datosIniciales,
      grafo: config.grafo,
      nodosRefugio: escenario.nodosRefugio,
    });
    return { ...base, calentamiento, metricas };
  };

  return async (evento: EventoDemo | null | undefined): Promise<ResultadoDemo> => {
    const { ronda, semilla, modo, flota } = parseEvento(evento);
    let ultimo = await jugar(ronda, semilla, modo, flota);
    if (!ultimo.iniciada) return ultimo;
    let rondasJugadas = 1;
    // Una ronda de demo dura como máximo 150 turnos de 2 s: solo se encadena mientras quepa una completa.
    while (modo === "demo" && deps.tiempoRestanteMs && deps.tiempoRestanteMs() >= MARGEN_RONDA_MS) {
      const siguiente = await jugar(ronda, (semilla + rondasJugadas) % 0x100000000, modo, flota);
      if (!siguiente.iniciada) break; // otra ronda tomó el lock entretanto: es la que se ve en el mapa
      ultimo = siguiente;
      rondasJugadas++;
    }
    return { ...ultimo, rondasJugadas };
  };
}

// 150 turnos × 2 s más las escrituras y un margen de seguridad, frente al timeout de 15 minutos de Lambda.
const MARGEN_RONDA_MS = 330_000;

// Se crea una vez por instancia caliente, igual que los clientes de la Lambda de la API.
const cliente = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = (evento: EventoDemo, contexto?: { getRemainingTimeInMillis(): number }) =>
  crearHandler({
    cliente,
    tabla: process.env.MUNDO_TABLE ?? "",
    tiempoRestanteMs: contexto ? () => contexto.getRemainingTimeInMillis() : undefined,
  })(evento);
