import type { EstadoTurno } from "@abcstack/shared";

/** Entrada inmutable para el ruteo; no es el snapshot completo y mutable que usa /estado. */
export type MundoTurno = Readonly<{
  partidaId: string;
  turno: number;
  zombies: readonly Readonly<EstadoTurno["zombies"][number]>[];
  aristasBloqueadas: readonly string[];
  // Sobrevivientes del turno (Pro: capacidad de refugios). Opcional: sin ellos, el motor ignora la capacidad.
  sobrevivientes?: readonly Readonly<Pick<EstadoTurno["sobrevivientes"][number], "id" | "nodo" | "estado">>[];
}>;

export interface FuenteMundo {
  /** Devuelve el turno pedido o, si no existe, el último turno existente <= n de esta partida. */
  obtenerTurno(partidaId: string, n: number): Promise<MundoTurno>;
}

type CodigoErrorFuente = "INVALID_WORLD_REQUEST" | "INVALID_WORLD_DATA" | "TURN_NOT_FOUND" | "WORLD_EXPIRED";

export class ErrorFuenteMundo extends Error {
  constructor(readonly code: CodigoErrorFuente, message: string) {
    super(message);
    this.name = "ErrorFuenteMundo";
  }
}
