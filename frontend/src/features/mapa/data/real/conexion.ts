import type { Conexion, Snapshot } from "@/features/mapa/domain/tipos";
import type { ResultadoEstado } from "@/features/mapa/data/real/estado-api";

// Three turns: one or two bad polls keep the last real world on screen instead of flashing to the
// simulation and back (which would also fire alerts for a world that never existed).
export const GRACIA_MS = 6000;

export type UltimoReal = { snapshot: Snapshot; recibidoEn: number };

type Entrada = {
  resultado: ResultadoEstado | "pendiente" | "error";
  ultimoReal: UltimoReal | null;
  ahora: number; // time of the latest poll, success or failure
};

type Salida = { snapshot: Snapshot | null; conexion: Conexion; ultimoReal: UltimoReal | null };

export function resolverConexion({ resultado, ultimoReal, ahora }: Entrada): Salida {
  if (resultado === "pendiente") return { snapshot: null, conexion: "conectando", ultimoReal };

  if (resultado !== "error" && resultado.tipo === "partida") {
    const mismo = ultimoReal?.snapshot === resultado.snapshot && ultimoReal.recibidoEn === ahora;
    return { snapshot: resultado.snapshot, conexion: "en_vivo", ultimoReal: mismo ? ultimoReal : { snapshot: resultado.snapshot, recibidoEn: ahora } };
  }

  if (ultimoReal && ahora - ultimoReal.recibidoEn < GRACIA_MS) {
    return { snapshot: ultimoReal.snapshot, conexion: "reconectando", ultimoReal };
  }
  // Between rounds the last real turn stays on screen (labelled "Esperando la próxima ronda"):
  // jumping to the 200-survivor simulation would make the numbers leap. The simulation is only for a
  // visitor who has not seen a real game yet, or a broken connection.
  if (resultado !== "error" && resultado.tipo === "sinPartida") {
    return { snapshot: ultimoReal?.snapshot ?? null, conexion: "sin_partida", ultimoReal };
  }
  return { snapshot: null, conexion: "sin_conexion", ultimoReal };
}
