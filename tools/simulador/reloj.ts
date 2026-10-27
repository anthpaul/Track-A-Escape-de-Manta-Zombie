/**
 * Controllable clock for the simulator.
 *
 * In real execution every tick waits the full 2 seconds.
 * In tests we swap in a fake that resolves immediately, so a 5-minute
 * round of 150 turns does not take 5 actual minutes.
 */
export interface Reloj {
  /**
   * Wait until the end of the current tick window.
   *
   * @param iniciado  epoch-ms when the tick started (from Date.now())
   * @param duracionMs  nominal tick length in ms (2000 in production)
   */
  esperarTick(iniciado: number, duracionMs: number): Promise<void>;
  /** Current wall-clock time in epoch-ms. */
  ahora(): number;
}

/** Production clock — sleeps the remaining time in the tick window. */
export const relojReal: Reloj = {
  ahora: () => Date.now(),
  async esperarTick(iniciado, duracionMs) {
    const restante = duracionMs - (Date.now() - iniciado);
    if (restante > 0) await new Promise((resolve) => setTimeout(resolve, restante));
  },
};

/**
 * Accelerated clock for tests.
 * `ahora()` returns a synthetic counter; `esperarTick` resolves immediately.
 * Both advance the counter by `duracionMs` so consumers that read `ahora()`
 * after each tick see monotonically increasing time, just like real code.
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
