/**
 * In-process motor for scheduled demo rounds (S6).
 *
 * Calls the same calcularSiguienteNodo that POST /paso runs, without HTTP: a
 * demo round every few minutes would otherwise send millions of billable API
 * Gateway requests a day just to keep the public map moving. It sees the world
 * the way /paso does: visible zombies only (sleepers are never published).
 *
 * Evaluation rounds keep using MotorHttp, which measures the real /paso.
 */
import { zombiesVisibles, type Zombie } from "@abcstack/shared";
import { calcularSiguienteNodo } from "../../backend/src/motor/motor";
import type { ClienteMotor } from "./motor-falso";

export function crearMotorEnProceso(
  obtenerZombies: () => readonly Zombie[],
  obtenerBloqueos: () => readonly string[],
): ClienteMotor {
  return {
    async pedirPaso({ sobrevivienteId, nodoActual, turno }) {
      // zombiesVisibles already drops sleepers; the flatMap makes that explicit for the type checker.
      const zombies = zombiesVisibles([...obtenerZombies()]).flatMap((z) => (z.tipo === "dormido" ? [] : [{ ...z, tipo: z.tipo }]));
      const mundo = { partidaId: "demo", turno, zombies, aristasBloqueadas: [...obtenerBloqueos()] };
      return { siguienteNodo: calcularSiguienteNodo({ sobrevivienteId, nodoActual, mundo }).siguienteNodo };
    },
  };
}
