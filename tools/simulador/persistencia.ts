/**
 * Capa de persistencia del simulador.
 *
 * La interfaz replica la secuencia de escritura en DynamoDB descrita en AGENTS.md §4.2
 * y §4.5, y la implementación en memoria permite verificar localmente todo el ciclo
 * de turnos antes de conectarse a AWS.
 *
 * Orden de escritura (coincide con el contrato):
 *   1. guardarTurnoIncompleto  — zombies ya movidos, /paso todavía sin llamar
 *   2. completarTurno          — siguienteNodo completado, completo = true
 *
 * El motor lee un turno con leerTurno; solo necesita el registro incompleto
 * (zombies + calles bloqueadas). El panel lee con leerUltimoTurnoCompleto.
 */
import type { Zombie, Sobreviviente } from "@abcstack/shared";
import type { Vehiculo } from "@abcstack/shared";

// -------------------------------------------------------------------------
// Tipos públicos
// -------------------------------------------------------------------------

/** Snapshot escrito en la fase 1 de cada turno (incompleto). */
export interface TurnoParcial {
  turno: number;
  zombies: readonly Zombie[];          // ya movidos en este turno
  aristasBloqueadas: readonly string[];
  sobrevivientes: readonly Sobreviviente[];   // posiciones ANTES del movimiento de este turno
}

/** Snapshot completo después de la fase 2 (completo = true). */
export interface TurnoCompleto extends TurnoParcial {
  completo: true;
  /** Flota de rescate (Pro): las camionetas después de este turno, cuando la ronda tiene flota. */
  vehiculos?: Vehiculo[];
}

export interface PersistenciaPartida {
  /**
   * Fase 1: escribe el turno con completo = false.
   * El motor puede leerlo de inmediato.
   */
  guardarTurnoIncompleto(parcial: TurnoParcial): Promise<void>;

  /**
   * Fase 2: agrega siguienteNodo a cada sobreviviente y marca completo = true.
   * Una sola escritura (coincide con el único UpdateItem de AGENTS.md §4.2).
   */
  completarTurno(
    turno: number,
    decisiones: ReadonlyMap<string /* sobrevivienteId */, string /* siguienteNodo */>,
    sobrevivientesFinales?: readonly Sobreviviente[],
    vehiculos?: readonly Vehiculo[],
  ): Promise<void>;

  /**
   * Lee un turno por número. Devuelve undefined si todavía no se escribió.
   * Lo usa el motor para obtener las posiciones de los zombies (solo necesita el registro parcial).
   */
  leerTurno(turno: number): Promise<TurnoParcial | TurnoCompleto | undefined>;

  /**
   * Devuelve el turno más reciente marcado con completo = true.
   * Lo usa GET /estado (el panel nunca ve un turno a medias).
   * Devuelve undefined cuando todavía no existe ningún turno completo.
   */
  leerUltimoTurnoCompleto(): Promise<TurnoCompleto | undefined>;
}

// -------------------------------------------------------------------------
// Implementación en memoria
// -------------------------------------------------------------------------

/**
 * Almacén volátil en proceso. Los datos viven solo mientras dura el proceso;
 * no se escribe nada en disco ni en DynamoDB.
 *
 * Usarlo para:
 *   - desarrollo local (npm run dev:simulador)
 *   - tests unitarios y de integración
 *
 * En producción se reemplaza por DynamoPersistencia (implementada en S5).
 */
export function crearPersistenciaMemoria(): PersistenciaPartida {
  // Mapea número de turno → registro. Internamente es mutable, pero se expone como
  // readonly a quien llama para que no pueda saltarse los métodos de escritura.
  const turnos = new Map<number, TurnoParcial & { completo: boolean }>();
  let ultimoCompleto: TurnoCompleto | undefined;

  return {
    async guardarTurnoIncompleto(parcial) {
      turnos.set(parcial.turno, { ...parcial, completo: false });
    },

    async completarTurno(turno, decisiones, sobrevivientesFinales, vehiculos) {
      const existing = turnos.get(turno);
      if (!existing) throw new Error(`Turn ${turno} not found — call guardarTurnoIncompleto first`);

      // Aplica siguienteNodo a cada sobreviviente cuyo id aparece en las decisiones.
      const sobrevivientesActualizados: Sobreviviente[] = (sobrevivientesFinales ?? existing.sobrevivientes).map((s) => {
        const siguiente = decisiones.get(s.id);
        return siguiente !== undefined ? { ...s, siguienteNodo: siguiente } : s;
      });

      const completo: TurnoCompleto = {
        ...existing,
        sobrevivientes: sobrevivientesActualizados,
        completo: true,
        ...(vehiculos && { vehiculos: vehiculos.map((v) => ({ ...v, pasajeros: [...v.pasajeros] })) }),
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
