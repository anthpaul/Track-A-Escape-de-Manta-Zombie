import type { TipoCalle } from "./tipos";

// Cuándo se vio bloqueada por primera vez cada calle bloqueada, para que el mapa pueda decir "desde el turno 21".
// El snapshot solo lista las calles bloqueadas ahora; el front recuerda el resto.
export type Bloqueos = {
  turno: number;
  // Id de calle → primer turno en que se vio bloqueada, o null si ya estaba bloqueada en el primer
  // snapshot que vio esta página (el inicio real es desconocido).
  desde: Map<string, number | null>;
};

export function actualizarBloqueos(previo: Bloqueos | null, turno: number, aristas: readonly string[]): Bloqueos {
  // Una ronda nueva reinicia la cuenta de turnos: nada de la ronda anterior aplica.
  const nuevaRonda = previo === null || turno < previo.turno;
  const desde = new Map<string, number | null>();
  for (const id of aristas) {
    if (!nuevaRonda && previo.desde.has(id)) desde.set(id, previo.desde.get(id)!);
    // En el turno 1 nada puede haber empezado antes; en otro caso, una calle ya bloqueada en el primer
    // snapshot visto tiene un inicio desconocido.
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
