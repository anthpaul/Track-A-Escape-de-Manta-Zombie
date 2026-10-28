import type { Sobreviviente } from "@/features/mapa/domain/tipos";

// A qué sobreviviente sigue el mapa: al que eligió el usuario mientras siga en camino;
// si no, al de menor id en camino, así siempre hay una ruta planificada visible (plan A9).
export function elegirSeguido(sobrevivientes: Sobreviviente[], actualId: string | null): string | null {
  const enRuta = sobrevivientes.filter((s) => s.estado === "en_ruta");
  if (actualId && enRuta.some((s) => s.id === actualId)) return actualId;
  if (enRuta.length === 0) return null;
  return enRuta.map((s) => s.id).sort()[0];
}
