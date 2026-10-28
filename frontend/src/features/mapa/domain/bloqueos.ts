import type { TipoCalle } from "./tipos";

// When each blocked street was first seen blocked, so the map can say "since turn 21".
// The snapshot only lists the streets blocked now; the front remembers the rest.
export type Bloqueos = {
  turno: number;
  // Street id → first turn seen blocked, or null when it was already blocked on the first
  // snapshot this page saw (the real start is unknown).
  desde: Map<string, number | null>;
};

export function actualizarBloqueos(previo: Bloqueos | null, turno: number, aristas: readonly string[]): Bloqueos {
  // A new round restarts the turn count: nothing from the previous round applies.
  const nuevaRonda = previo === null || turno < previo.turno;
  const desde = new Map<string, number | null>();
  for (const id of aristas) {
    if (!nuevaRonda && previo.desde.has(id)) desde.set(id, previo.desde.get(id)!);
    // On turn 1 nothing can have started earlier; otherwise a street already blocked on the first
    // snapshot seen has an unknown start.
    else desde.set(id, previo === null && turno > 1 ? null : turno);
  }
  return { turno, desde };
}

export function textoBloqueo(tipo: TipoCalle, desde: number | null) {
  return {
    titulo: tipo === "puente" ? "Puente dañado" : "Calle cerrada",
    detalle: desde === null ? "Nadie puede cruzar" : `Nadie puede cruzar desde el turno ${desde}`,
  };
}
