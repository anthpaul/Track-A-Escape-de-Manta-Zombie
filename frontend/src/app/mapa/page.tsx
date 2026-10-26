import type { Metadata } from "next";
import { PantallaMapa } from "@/features/mapa";

export const metadata: Metadata = {
  title: "Mapa en vivo · Escape de Manta Zombie",
  description: "Zombies, sobrevivientes, rutas y refugios de Manta en tiempo real.",
};

export default function MapaPage() {
  return (
    <main className="h-dvh w-full bg-background">
      <PantallaMapa />
    </main>
  );
}
