/**
 * Persistence layer for the simulator.
 *
 * The interface mirrors the DynamoDB write sequence described in AGENTS.md §4.2
 * and §4.5, but the in-memory implementation lets us verify the entire turn
 * loop locally before connecting to AWS.
 *
 * Write order (matches the contract):
 *   1. guardarTurnoIncompleto  — zombies moved, /paso not yet called
 *   2. completarTurno          — siguienteNodo filled, completo = true
 *
 * The motor reads a turn via leerTurno; it only needs the incomplete record
 * (zombies + blocked streets).  The dashboard reads via leerUltimoTurnoCompleto.
 */
import type { Zombie, Sobreviviente } from "@abcstack/shared";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

/** Snapshot written at phase 1 of each turn (incomplete). */
export interface TurnoParcial {
  turno: number;
  zombies: readonly Zombie[];          // already moved for this turn
  aristasBloqueadas: readonly string[];
  sobrevivientes: readonly Sobreviviente[];   // positions BEFORE this turn's move
}

/** Full snapshot after phase 2 (complete = true). */
export interface TurnoCompleto extends TurnoParcial {
  completo: true;
}

export interface PersistenciaPartida {
  /**
   * Phase 1: write the turn with completo = false.
   * The motor can read this right away.
   */
  guardarTurnoIncompleto(parcial: TurnoParcial): Promise<void>;

  /**
   * Phase 2: add siguienteNodo to each survivor and set completo = true.
   * One single write (matches the single UpdateItem in AGENTS.md §4.2).
   */
  completarTurno(
    turno: number,
    decisiones: ReadonlyMap<string /* sobrevivienteId */, string /* siguienteNodo */>,
    sobrevivientesFinales?: readonly Sobreviviente[],
  ): Promise<void>;

  /**
   * Read a turn by number.  Returns undefined if not yet written.
   * Used by the motor to fetch zombie positions (it only needs the partial record).
   */
  leerTurno(turno: number): Promise<TurnoParcial | TurnoCompleto | undefined>;

  /**
   * Return the most recent turn marked completo = true.
   * Used by GET /estado (the dashboard never sees a partial turn).
   * Returns undefined when no complete turn exists yet.
   */
  leerUltimoTurnoCompleto(): Promise<TurnoCompleto | undefined>;
}

// -------------------------------------------------------------------------
// In-memory implementation
// -------------------------------------------------------------------------

/**
 * Volatile in-process store.  Data lives only for the duration of the process;
 * nothing is written to disk or to DynamoDB.
 *
 * Use this for:
 *   - local development (npm run dev:simulador)
 *   - unit and integration tests
 *
 * For production swap in DynamoPersistencia (implemented in S5).
 */
export function crearPersistenciaMemoria(): PersistenciaPartida {
  // Maps turn number → record.  Stored as mutable internally but exposed as
  // readonly to callers so they cannot bypass the write methods.
  const turnos = new Map<number, TurnoParcial & { completo: boolean }>();
  let ultimoCompleto: TurnoCompleto | undefined;

  return {
    async guardarTurnoIncompleto(parcial) {
      turnos.set(parcial.turno, { ...parcial, completo: false });
    },

    async completarTurno(turno, decisiones, sobrevivientesFinales) {
      const existing = turnos.get(turno);
      if (!existing) throw new Error(`Turn ${turno} not found — call guardarTurnoIncompleto first`);

      // Apply siguienteNodo to each survivor whose ID appears in decisions.
      const sobrevivientesActualizados: Sobreviviente[] = (sobrevivientesFinales ?? existing.sobrevivientes).map((s) => {
        const siguiente = decisiones.get(s.id);
        return siguiente !== undefined ? { ...s, siguienteNodo: siguiente } : s;
      });

      const completo: TurnoCompleto = {
        ...existing,
        sobrevivientes: sobrevivientesActualizados,
        completo: true,
      };

      turnos.set(turno, completo);
      ultimoCompleto = completo;
    },

    async leerTurno(turno) {
      return turnos.get(turno);
    },

    async leerUltimoTurnoCompleto() {
      return ultimoCompleto;
    },
  };
}
