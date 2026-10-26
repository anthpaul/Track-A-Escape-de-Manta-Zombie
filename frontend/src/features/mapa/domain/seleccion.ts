import type { Sobreviviente } from "@/features/mapa/domain/tipos";

// Which survivor the map follows: the one picked by the user while on the road,
// otherwise the lowest on-road id, so a planned route is always visible (plan A9).
export function elegirSeguido(sobrevivientes: Sobreviviente[], actualId: string | null): string | null {
  const enRuta = sobrevivientes.filter((s) => s.estado === "en_ruta");
  if (actualId && enRuta.some((s) => s.id === actualId)) return actualId;
  if (enRuta.length === 0) return null;
  return enRuta.map((s) => s.id).sort()[0];
}
