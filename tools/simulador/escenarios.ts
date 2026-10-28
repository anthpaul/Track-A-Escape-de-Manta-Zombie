/**
 * Constructores de escenarios de ronda — S4 (AGENTS.md §0, prueba de fuego).
 *
 * Cada función devuelve una ConfigRonda lista para pasar a correrRonda(), junto con
 * los datos iniciales de los sobrevivientes que necesitan las métricas de eficiencia.
 *
 * Composiciones (fijadas por la organización del reto):
 *   R1 — 20 sobrevivientes, solo caminantes, sin eventos.
 *   R2 — 80 sobrevivientes, caminantes + corredores + hordas; el puente C-0199 colapsa en el turno 30.
 *   R3 — 200 sobrevivientes, todos los tipos incluidos dormidos; dos calles se bloquean en los turnos 20 y 60.
 *
 * Distribución de sobrevivientes: repartidos en partes iguales entre los cuatro barrios con el
 * generador aleatorio con semilla de preparar.ts. Cada sobreviviente arranca en un nodo de barrio.
 *
 * Ubicación de zombies: posiciones aleatorias con semilla en nodos que no son refugio ni inicio de barrio.
 */
import { crearAleatorio } from "./preparar";
import { generarPartidaId } from "../../backend/src/db/keys";
import { crearGrafo, GrafoSchema, type Nodo } from "@abcstack/shared";
import type { ZombieInterno } from "@abcstack/shared";
import type { Sobreviviente } from "@abcstack/shared";
import { crearMotorFalso } from "./motor-falso";
import { crearPersistenciaMemoria } from "./persistencia";
import { relojReal } from "./reloj";
import type { ClienteMotor } from "./motor-falso";
import type { PersistenciaPartida } from "./persistencia";
import type { Reloj } from "./reloj";
import type { ConfigRonda, EventoRonda } from "./turno";
import type { DatosSobreviviente } from "./metricas";
// Import estático para que esbuild empaquete el grafo en la Lambda del simulador (S6); no se lee ningún archivo en ejecución.
import grafoManta from "@abcstack/shared/data/manta.json";
import { crearFlota } from "@abcstack/shared";

// -------------------------------------------------------------------------
// Carga del grafo (una vez por proceso)
// -------------------------------------------------------------------------

function cargarGrafo() {
  return GrafoSchema.parse(grafoManta);
}

// -------------------------------------------------------------------------
// Aleatorio con semilla (Mulberry32, el mismo de preparar.ts)
// -------------------------------------------------------------------------

let ultimaIdentidadMs = 0;
function nuevaIdentidad(ronda: 1 | 2 | 3, modo: "evaluacion" | "demo" = "evaluacion"): string {
  // Conserva el formato canónico en epoch ms y evita colisiones dentro del mismo proceso.
  ultimaIdentidadMs = Math.max(Date.now(), ultimaIdentidadMs + 1);
  return generarPartidaId(modo, ronda).replace(/\d+$/, String(ultimaIdentidadMs));
}

// -------------------------------------------------------------------------
// Helpers para ubicar a los actores
// -------------------------------------------------------------------------

const BARRIOS = ["tarqui", "los_esteros", "barbasquillo", "jocay"] as const;
type Barrio = (typeof BARRIOS)[number];

function nodosDelBarrio(nodos: readonly Nodo[], barrio: Barrio): string[] {
  return nodos.filter((n) => n.barrio === barrio).map((n) => n.id);
}

/**
 * Reparte `total` sobrevivientes en partes iguales entre los cuatro barrios.
 * Devuelve un arreglo de pares { id, nodoInicial }.
 */
function colocarSobrevivientes(
  total: number,
  nodos: readonly Nodo[],
  rnd: () => number,
): Array<{ id: string; nodo: string }> {
  const porBarrio = Math.floor(total / 4);
  const resto = total % 4;
  const resultado: Array<{ id: string; nodo: string }> = [];
  let contador = 1;

  for (let b = 0; b < 4; b++) {
    const cantidad = porBarrio + (b < resto ? 1 : 0);
    const candidatos = nodosDelBarrio(nodos, BARRIOS[b]!);
    if (candidatos.length === 0) throw new Error(`No starting nodes for barrio ${BARRIOS[b]}`);
    for (let i = 0; i < cantidad; i++) {
      const nodo = candidatos[Math.floor(rnd() * candidatos.length)]!;
      const id = `S-${String(contador).padStart(4, "0")}`;
      resultado.push({ id, nodo });
      contador++;
    }
  }
  return resultado;
}

/**
 * Ubica `total` zombies en nodos aleatorios que no son refugio.
 * Devuelve ZombieInterno[] con la distribución de tipos indicada.
 */
function colocarZombies(
  specs: Array<{ tipo: ZombieInterno["tipo"]; cantidad: number }>,
  nodos: readonly Nodo[],
  nodosRefugio: ReadonlySet<string>,
  rnd: () => number,
): ZombieInterno[] {
  const candidatos = nodos.map((n) => n.id).filter((id) => !nodosRefugio.has(id));
  const resultado: ZombieInterno[] = [];
  let contador = 1;
  for (const { tipo, cantidad } of specs) {
    for (let i = 0; i < cantidad; i++) {
      const nodo = candidatos[Math.floor(rnd() * candidatos.length)]!;
      resultado.push({
        id: `Z-${String(contador).padStart(4, "0")}`,
        tipo,
        nodo,
        movioPasadoTurno: false,
      });
      contador++;
    }
  }
  return resultado;
}

// -------------------------------------------------------------------------
// Salida común de los constructores de escenarios
// -------------------------------------------------------------------------

export interface Escenario {
  config: ConfigRonda;
  datosIniciales: DatosSobreviviente[];
  nodosRefugio: ReadonlySet<string>;
}

interface OpcionesEscenario {
  semilla: number;
  motor?: ClienteMotor;
  persistencia?: PersistenciaPartida;
  reloj?: Reloj;
  /** Las rondas de demo programadas (S6) se marcan como "demo"; todo lo demás queda como "evaluacion". */
  modo?: "evaluacion" | "demo";
  /** Flota de rescate (Pro): cinco camionetas. Apagada salvo que se pida, así las rondas de evaluación no cambian. */
  flota?: boolean;
}

// Nodo de refugio → capacidad (Pro): un refugio lleno no admite a nadie más (shared/reglas.ts resolverLlegadas).
const CAPACIDAD_REFUGIO: ReadonlyMap<string, number> = new Map(cargarGrafo().refugios.map((r) => [r.nodo, r.capacidad]));

// 150 turnos × 2 s = 5 minutos (duración oficial de una ronda)
const TOTAL_TURNOS = 150;

// -------------------------------------------------------------------------
// R1 — Anochecer: 20 sobrevivientes, solo caminantes, sin eventos
// -------------------------------------------------------------------------

export function crearEscenarioR1(opts: OpcionesEscenario): Escenario {
  const grafoData = cargarGrafo();
  const grafo = crearGrafo(grafoData);
  const rnd = crearAleatorio(opts.semilla);

  const nodosRefugio = new Set(grafoData.refugios.map((r) => r.nodo));
  const ubicacionesSobrevivientes = colocarSobrevivientes(20, grafoData.nodos, rnd);
  const sobrevivientes: Sobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id, nodo, estado: "en_ruta",
  }));

  const zombies = colocarZombies(
    [{ tipo: "caminante", cantidad: 10 }],
    grafoData.nodos,
    nodosRefugio,
    rnd,
  );

  const motor = opts.motor ?? crearMotorFalso(grafo, () => config.zombies, () => config.aristasBloqueadas);
  const persistencia = opts.persistencia ?? crearPersistenciaMemoria();
  const reloj = opts.reloj ?? relojReal;

  const config: ConfigRonda = {
    grafo,
    zombies,
    sobrevivientes,
    aristasBloqueadas: [],
    motor,
    persistencia,
    reloj,
    partidaId: nuevaIdentidad(1, opts.modo),
    ronda: 1,
    nodosRefugio,
    capacidadRefugio: CAPACIDAD_REFUGIO,
    ...(opts.flota && { flota: crearFlota(cargarGrafo().refugios.map((x) => x.nodo)) }),
    aleatorio: rnd,
    totalTurnos: TOTAL_TURNOS,
    // Las rondas de demo terminan cuando ya no queda nadie en ruta, para que el mapa público no muestre solo zombies durante minutos.
    detenerSinActivos: opts.modo === "demo",
    eventos: [],
  };

  const datosIniciales: DatosSobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id,
    nodoInicial: nodo,
    estado: "en_ruta",
    turnoLlegada: 0,
  }));

  return { config, datosIniciales, nodosRefugio };
}

// -------------------------------------------------------------------------
// R2 — Medianoche: 80 sobrevivientes, caminantes + corredores + hordas, colapso de puente en el turno 30
// -------------------------------------------------------------------------

export function crearEscenarioR2(opts: OpcionesEscenario): Escenario {
  const grafoData = cargarGrafo();
  const grafo = crearGrafo(grafoData);
  const rnd = crearAleatorio(opts.semilla);

  const nodosRefugio = new Set(grafoData.refugios.map((r) => r.nodo));
  const ubicacionesSobrevivientes = colocarSobrevivientes(80, grafoData.nodos, rnd);
  const sobrevivientes: Sobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id, nodo, estado: "en_ruta",
  }));

  const zombies = colocarZombies(
    [
      { tipo: "caminante", cantidad: 15 },
      { tipo: "corredor", cantidad: 10 },
      { tipo: "horda", cantidad: 5 },
    ],
    grafoData.nodos,
    nodosRefugio,
    rnd,
  );

  // C-0199 es el puente real del grafo (verificado en shared/data/README.md).
  const eventos: EventoRonda[] = [
    { turno: 30, calleId: "C-0199", descripcion: "bridge collapse (R2)" },
  ];

  if (grafoData.calles.find(c => c.id === "C-0199")?.tipo !== "puente") {
    throw new Error("R2 requires the real C-0199 bridge in the selected graph");
  }
  const motor = opts.motor ?? crearMotorFalso(grafo, () => config.zombies, () => config.aristasBloqueadas);
  const persistencia = opts.persistencia ?? crearPersistenciaMemoria();
  const reloj = opts.reloj ?? relojReal;

  const config: ConfigRonda = {
    grafo,
    zombies,
    sobrevivientes,
    aristasBloqueadas: [],
    motor,
    persistencia,
    reloj,
    partidaId: nuevaIdentidad(2, opts.modo),
    ronda: 2,
    nodosRefugio,
    capacidadRefugio: CAPACIDAD_REFUGIO,
    ...(opts.flota && { flota: crearFlota(cargarGrafo().refugios.map((x) => x.nodo)) }),
    aleatorio: rnd,
    totalTurnos: TOTAL_TURNOS,
    // Las rondas de demo terminan cuando ya no queda nadie en ruta, para que el mapa público no muestre solo zombies durante minutos.
    detenerSinActivos: opts.modo === "demo",
    eventos,
  };

  const datosIniciales: DatosSobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id,
    nodoInicial: nodo,
    estado: "en_ruta",
    turnoLlegada: 0,
  }));

  return { config, datosIniciales, nodosRefugio };
}

// -------------------------------------------------------------------------
// R3 — Apocalipsis: 200 sobrevivientes, todos los tipos incluidos dormidos, dos bloqueos
// -------------------------------------------------------------------------

export function crearEscenarioR3(opts: OpcionesEscenario): Escenario {
  const grafoData = cargarGrafo();
  const grafo = crearGrafo(grafoData);
  const rnd = crearAleatorio(opts.semilla);

  const nodosRefugio = new Set(grafoData.refugios.map((r) => r.nodo));
  const ubicacionesSobrevivientes = colocarSobrevivientes(200, grafoData.nodos, rnd);
  const sobrevivientes: Sobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id, nodo, estado: "en_ruta",
  }));

  const zombies = colocarZombies(
    [
      { tipo: "caminante", cantidad: 20 },
      { tipo: "corredor", cantidad: 15 },
      { tipo: "horda", cantidad: 8 },
      { tipo: "dormido", cantidad: 10 },
    ],
    grafoData.nodos,
    nodosRefugio,
    rnd,
  );

  // Dos calles bloqueadas en turnos distintos.
  // C-0050 y C-0100 son calles arbitrarias en el medio del grafo.
  // En la prueba de fuego real la organización elige las calles; acá se eligen
  // dos calles reales de manta.json que tienen desvíos disponibles.
  const calles = grafoData.calles;
  const calle1 = calles[50]?.id;
  const calle2 = calles[100]?.id;
  if (!calle1 || !calle2 || calle1 === calle2) throw new Error("R3 requires two distinct real streets");
  const eventos: EventoRonda[] = [
    { turno: 20, calleId: calle1, descripcion: "avenue blocked R3 (turn 20)" },
    { turno: 60, calleId: calle2, descripcion: "street blocked R3 (turn 60)" },
  ];

  const motor = opts.motor ?? crearMotorFalso(grafo, () => config.zombies, () => config.aristasBloqueadas);
  const persistencia = opts.persistencia ?? crearPersistenciaMemoria();
  const reloj = opts.reloj ?? relojReal;

  const config: ConfigRonda = {
    grafo,
    zombies,
    sobrevivientes,
    aristasBloqueadas: [],
    motor,
    persistencia,
    reloj,
    partidaId: nuevaIdentidad(3, opts.modo),
    ronda: 3,
    nodosRefugio,
    capacidadRefugio: CAPACIDAD_REFUGIO,
    ...(opts.flota && { flota: crearFlota(cargarGrafo().refugios.map((x) => x.nodo)) }),
    aleatorio: rnd,
    totalTurnos: TOTAL_TURNOS,
    // Las rondas de demo terminan cuando ya no queda nadie en ruta, para que el mapa público no muestre solo zombies durante minutos.
    detenerSinActivos: opts.modo === "demo",
    eventos,
  };

  const datosIniciales: DatosSobreviviente[] = ubicacionesSobrevivientes.map(({ id, nodo }) => ({
    id,
    nodoInicial: nodo,
    estado: "en_ruta",
    turnoLlegada: 0,
  }));

  return { config, datosIniciales, nodosRefugio };
}
