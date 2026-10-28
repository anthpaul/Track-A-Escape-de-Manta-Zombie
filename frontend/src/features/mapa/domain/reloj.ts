// Reloj del mundo del juego: cada turno es un minuto de la noche del 31 de octubre, desde las 21:30. Una ronda de 5 minutos
// (150 turnos) termina justo a medianoche. Es solo narrativa: la simulación y el motor trabajan con el número de turno.
const INICIO_MIN = 21 * 60 + 30;
const MIN_DIA = 24 * 60;

const dosCifras = (n: number) => String(n).padStart(2, "0");

export function horaDelTurno(turno: number): { fecha: string; hora: string } {
  const total = INICIO_MIN + Math.max(0, turno);
  const minutos = total % MIN_DIA;
  return {
    fecha: total < MIN_DIA ? "31 OCT 2026" : "1 NOV 2026",
    hora: `${dosCifras(Math.floor(minutos / 60))}:${dosCifras(minutos % 60)}`,
  };
}
