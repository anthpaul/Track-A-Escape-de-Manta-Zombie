/**
 * Motor en proceso para las rondas de demo programadas (S6).
 *
 * Llama a la misma calcularSiguienteNodo que ejecuta POST /paso, sin HTTP: de lo
 * contrario, una ronda de demo cada pocos minutos mandaría millones de pedidos
 * facturables a API Gateway por día solo para mantener en movimiento el mapa público.
 * Ve el mundo igual que /paso: solo zombies visibles (los dormidos nunca se publican).
 *
 * Las rondas de evaluación siguen usando MotorHttp, que mide el /paso real.
 */
import { zombiesVisibles, type Sobreviviente, type Zombie } from "@abcstack/shared";
import { calcularSiguienteNodo } from "../../backend/src/motor/motor";
import type { ClienteMotor } from "./motor-falso";

/** El paso que respondería /paso para este mundo, calculado en proceso. */
export function siguientePasoEnProceso(
  pedido: { sobrevivienteId: string; nodoActual: string; turno: number },
  zombiesTodos: readonly Zombie[],
  bloqueos: readonly string[],
  // Quién está dónde (Pro: capacidad de refugios), los mismos campos que /paso lee del turno publicado.
  sobrevivientes: readonly Pick<Sobreviviente, "id" | "nodo" | "estado">[] = [],
): string {
  // zombiesVisibles ya descarta a los dormidos; el flatMap lo hace explícito para el chequeo de tipos.
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
