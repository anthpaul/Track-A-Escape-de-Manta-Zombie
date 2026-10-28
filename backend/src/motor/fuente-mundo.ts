import type { EstadoTurno } from "@abcstack/shared";

/** Immutable routing input, not the mutable full snapshot used by /estado. */
export type MundoTurno = Readonly<{
  partidaId: string;
  turno: number;
  zombies: readonly Readonly<EstadoTurno["zombies"][number]>[];
  aristasBloqueadas: readonly string[];
  // Survivors of the turn (Pro: shelter capacity). Optional: without them the motor ignores capacity.
  sobrevivientes?: readonly Readonly<Pick<EstadoTurno["sobrevivientes"][number], "id" | "nodo" | "estado">>[];
}>;

export interface FuenteMundo {
  /** Return the requested turn, or the latest existing turn <= n in this game. */
  obtenerTurno(partidaId: string, n: number): Promise<MundoTurno>;
}

type CodigoErrorFuente = "INVALID_WORLD_REQUEST" | "INVALID_WORLD_DATA" | "TURN_NOT_FOUND" | "WORLD_EXPIRED";

export class ErrorFuenteMundo extends Error {
  constructor(readonly code: CodigoErrorFuente, message: string) {
    super(message);
    this.name = "ErrorFuenteMundo";
  }
}
