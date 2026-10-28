import { Binoculars, HardHat, Megaphone, Shield, Stethoscope, type LucideIcon } from "lucide-react";
import type { TipoAlerta } from "@/features/mapa/domain/alertas";

// Quién da cada aviso por la radio, para contar la noche como una historia: el ejército reporta las mordidas, ingeniería
// las calles y puentes caídos, el vigía las hordas, el encargado del refugio cuando se llena y los médicos las llegadas.
// Mismos colores de la barra de turno: rosa mordidas, rojo peligro, calabaza advertencias, marea llegadas.
export const VOZ_ALERTA: Record<TipoAlerta, { Icono: LucideIcon; voz: string; fondo: string }> = {
  mordido: { Icono: Shield, voz: "Ejército", fondo: "bg-crimson-700" },
  horda: { Icono: Binoculars, voz: "Vigía", fondo: "bg-sangre-700" },
  calle_bloqueada: { Icono: HardHat, voz: "Ingeniería", fondo: "bg-sangre-700" },
  refugio_lleno: { Icono: Megaphone, voz: "Refugio", fondo: "bg-calabaza-500" },
  llegada: { Icono: Stethoscope, voz: "Médicos", fondo: "bg-marea-700" },
};
