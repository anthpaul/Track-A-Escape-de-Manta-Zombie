import type { Conexion, Snapshot } from "@/features/mapa/domain/tipos";
import type { ResultadoEstado } from "@/features/mapa/data/real/estado-api";

// Tres turnos: uno o dos polls fallidos mantienen en pantalla el último mundo real en lugar de saltar a la
// simulación y volver (lo que además dispararía alertas de un mundo que nunca existió).
export const GRACIA_MS = 6000;

export type UltimoReal = { snapshot: Snapshot; recibidoEn: number };

type Entrada = {
  resultado: ResultadoEstado | "pendiente" | "error";
  ultimoReal: UltimoReal | null;
  ahora: number; // momento del último poll, exitoso o fallido
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
  // Entre rondas el último turno real queda en pantalla (con la etiqueta "Esperando la próxima ronda"):
  // saltar a la simulación de 200 sobrevivientes haría que los números brincaran. La simulación es solo para
  // un visitante que todavía no vio una partida real, o para una conexión caída.
  if (resultado !== "error" && resultado.tipo === "sinPartida") {
    return { snapshot: ultimoReal?.snapshot ?? null, conexion: "sin_partida", ultimoReal };
  }
  return { snapshot: null, conexion: "sin_conexion", ultimoReal };
}
