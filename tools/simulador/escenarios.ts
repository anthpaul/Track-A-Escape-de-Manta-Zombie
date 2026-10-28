/**
 * Round scenario builders — S4 (AGENTS.md §0, prueba de fuego).
 *
 * Each function returns a ConfigRonda ready to pass to correrRonda(), plus
 * the initial survivor data needed for efficiency metrics.
 *
 * Compositions (fixed by the challenge organizer):
 *   R1 — 20 survivors, walkers only, no events.
 *   R2 — 80 survivors, walkers + runners + hordes, bridge C-0199 collapses at turn 30.
 *   R3 — 200 survivors, all types including sleepers, two streets blocked at turns 20 and 60.
 *
 * Survivor distribution: evenly spread across the four barrios using the seeded
 * random generator from preparar.ts.  Each survivor starts on a barrio node.
 *
 * Zombie placement: seeded random positions on non-refuge, non-barrio-start nodes.
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
// Static import so esbuild bundles the graph into the simulator Lambda (S6); no file read at runtime.
import grafoManta from "@abcstack/shared/data/manta.json";
import { crearFlota } from "@abcstack/shared";

// -------------------------------------------------------------------------
// Graph loading (once per process)
// -------------------------------------------------------------------------

function cargarGrafo() {
  return GrafoSchema.parse(grafoManta);
}

// -------------------------------------------------------------------------
// Seeded random (Mulberry32 — same as preparar.ts)
// -------------------------------------------------------------------------

let ultimaIdentidadMs = 0;
function nuevaIdentidad(ronda: 1 | 2 | 3, modo: "evaluacion" | "demo" = "evaluacion"): string {
  // Retain the canonical epoch-ms format while avoiding same-process collisions.
  ultimaIdentidadMs = Math.max(Date.now(), ultimaIdentidadMs + 1);
  return generarPartidaId(modo, ronda).replace(/\d+$/, String(ultimaIdentidadMs));
}

// -------------------------------------------------------------------------
// Actor placement helpers
// -------------------------------------------------------------------------

const BARRIOS = ["tarqui", "los_esteros", "barbasquillo", "jocay"] as const;
type Barrio = (typeof BARRIOS)[number];

function nodosDelBarrio(nodos: readonly Nodo[], barrio: Barrio): string[] {
  return nodos.filter((n) => n.barrio === barrio).map((n) => n.id);
}

/**
 * Distribute `total` survivors evenly across the four barrios.
 * Returns an array of { id, nodoInicial } pairs.
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
 * Place `total` zombies on random non-refuge nodes.
 * Returns ZombieInterno[] with the given type distribution.
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
// Shared scenario builder output
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
  /** Scheduled demo rounds (S6) are tagged "demo"; everything else stays "evaluacion". */
  modo?: "evaluacion" | "demo";
  /** Rescue fleet (Pro): five vans. Off unless asked, so evaluation rounds stay as they are. */
  flota?: boolean;
}

// Refuge node → capacity (Pro): a full refuge admits nobody else (shared/reglas.ts resolverLlegadas).
const CAPACIDAD_REFUGIO: ReadonlyMap<string, number> = new Map(cargarGrafo().refugios.map((r) => [r.nodo, r.capacidad]));

// 150 turns × 2 s = 5 minutes (official round duration)
const TOTAL_TURNOS = 150;

// -------------------------------------------------------------------------
// R1 — Nightfall: 20 survivors, walkers only, no events
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
    // Demo rounds end when nobody is left on the road, so the public map is not just zombies for minutes.
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
// R2 — Midnight: 80 survivors, walkers + runners + hordes, bridge collapse turn 30
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

  // C-0199 is the real bridge in the graph (verified in shared/data/README.md).
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
    // Demo rounds end when nobody is left on the road, so the public map is not just zombies for minutes.
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
// R3 — Apocalypse: 200 survivors, all types including sleepers, two blockages
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

  // Two streets blocked at different turns.
  // C-0050 and C-0100 are arbitrary streets in the middle of the graph.
  // In the real fire test the organizer chooses which streets; we pick two
  // real streets from manta.json that have detours available.
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
    // Demo rounds end when nobody is left on the road, so the public map is not just zombies for minutes.
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
