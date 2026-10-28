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
import { zombiesVisibles, type Sobreviviente, type Zombie } from "@abcstack/shared";
import { calcularSiguienteNodo } from "../../backend/src/motor/motor";
import type { ClienteMotor } from "./motor-falso";

/** The step /paso would answer for this world, computed in process. */
export function siguientePasoEnProceso(
  pedido: { sobrevivienteId: string; nodoActual: string; turno: number },
  zombiesTodos: readonly Zombie[],
  bloqueos: readonly string[],
  // Who is where (Pro: shelter capacity), the same fields /paso reads from the published turn.
  sobrevivientes: readonly Pick<Sobreviviente, "id" | "nodo" | "estado">[] = [],
): string {
  // zombiesVisibles already drops sleepers; the flatMap makes that explicit for the type checker.
  const zombies = zombiesVisibles([...zombiesTodos]).flatMap((z) => (z.tipo === "dormido" ? [] : [{ ...z, tipo: z.tipo }]));
  const mundo = {
    partidaId: "demo",
    turno: pedido.turno,
    zombies,
    aristasBloqueadas: [...bloqueos],
    sobrevivientes: sobrevivientes.map(({ id, nodo, estado }) => ({ id, nodo, estado })),
  };
  return calcularSiguienteNodo({ sobrevivienteId: pedido.sobrevivienteId, nodoActual: pedido.nodoActual, mundo }).siguienteNodo;
}

export function crearMotorEnProceso(
  obtenerZombies: () => readonly Zombie[],
  obtenerBloqueos: () => readonly string[],
  obtenerSobrevivientes: () => readonly Pick<Sobreviviente, "id" | "nodo" | "estado">[] = () => [],
): ClienteMotor {
  return {
    async pedirPaso(pedido) {
      return { siguienteNodo: siguientePasoEnProceso(pedido, obtenerZombies(), obtenerBloqueos(), obtenerSobrevivientes()) };
    },
  };
}
