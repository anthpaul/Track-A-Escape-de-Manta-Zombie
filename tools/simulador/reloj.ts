/**
 * Reloj controlable del simulador.
 *
 * En la ejecución real cada tick espera los 2 segundos completos.
 * En los tests se reemplaza por uno falso que resuelve de inmediato, para que una
 * ronda de 5 minutos con 150 turnos no tarde 5 minutos reales.
 */
export interface Reloj {
  /**
   * Espera hasta el final de la ventana del tick actual.
   *
   * @param iniciado  epoch ms en que empezó el tick (de Date.now())
   * @param duracionMs  duración nominal del tick en ms (2000 en producción)
   */
  esperarTick(iniciado: number, duracionMs: number): Promise<void>;
  /** Hora actual del reloj en epoch ms. */
  ahora(): number;
}

/** Reloj de producción: duerme el tiempo que falta de la ventana del tick. */
export const relojReal: Reloj = {
  ahora: () => Date.now(),
  async esperarTick(iniciado, duracionMs) {
    const restante = duracionMs - (Date.now() - iniciado);
    if (restante > 0) await new Promise((resolve) => setTimeout(resolve, restante));
  },
};

/**
 * Reloj acelerado para tests.
 * `ahora()` devuelve un contador sintético; `esperarTick` resuelve de inmediato.
 * Ambos avanzan el contador en `duracionMs`, así quien lee `ahora()` después de
 * cada tick ve un tiempo que crece de forma monótona, igual que con el código real.
 */
export function crearRelojFake(inicioMs = 0): Reloj & { _ms: number } {
  let ms = inicioMs;
  return {
    get _ms() { return ms; },
    ahora: () => ms,
    async esperarTick(_iniciado, duracionMs) {
      ms += duracionMs;
    },
  };
}
