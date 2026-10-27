import type { EstadoTurno } from "@abcstack/shared";

/** Immutable routing input, not the mutable full snapshot used by /estado. */
export type MundoTurno = Readonly<{
  partidaId: string;
  turno: number;
  zombies: readonly Readonly<EstadoTurno["zombies"][number]>[];
  aristasBloqueadas: readonly string[];
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
