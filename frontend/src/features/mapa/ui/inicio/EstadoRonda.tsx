import { cn } from "@/lib/utils";
import type { Conexion } from "@/features/mapa/domain/tipos";

type Props = { conexion: Conexion; ronda: number | null; turno: number | null };

// Una línea honesta sobre la partida en vivo detrás de la URL pública.
export default function EstadoRonda({ conexion, ronda, turno }: Props) {
  const enVivo = (conexion === "en_vivo" || conexion === "reconectando") && ronda !== null;
  const texto = enVivo
    ? `Ronda ${ronda} · Turno ${turno} en curso`
    : conexion === "sin_partida"
      ? "Entre rondas: la próxima empieza en segundos"
      : conexion === "sin_conexion"
        ? "Sin conexión con el servidor"
        : conexion === "conectando"
          ? "Conectando…"
          : null;
  if (!texto) return null;

  return (
    <p role="status" className="inline-flex items-center gap-2 font-pixel text-[11px] uppercase text-calabaza-500">
      <span className={cn("size-2 rounded-full", enVivo ? "animate-pulse bg-calabaza-500" : "bg-crimson-700")} aria-hidden />
      {texto}
    </p>
  );
}
