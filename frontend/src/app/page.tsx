import type { Metadata } from "next";
import { PantallaInicio } from "@/features/mapa";

export const metadata: Metadata = {
  title: "Spondylus Z",
  description: "Motor de rutas en tiempo real: guía a cada sobreviviente de Manta hacia un refugio mientras el mapa cambia.",
};

export default function Inicio() {
  return <PantallaInicio />;
}
