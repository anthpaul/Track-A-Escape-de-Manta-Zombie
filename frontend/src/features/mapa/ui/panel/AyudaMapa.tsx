"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { abierta: boolean; onCambiar: (abierta: boolean) => void };

// What the visitor is looking at and what they can do, in three short blocks (no jargon).
export default function AyudaMapa({ abierta, onCambiar }: Props) {
  return (
    <Dialog open={abierta} onOpenChange={onCambiar}>
      <DialogContent className="border-crimson-300 bg-crimson-100 text-calabaza-900">
        <DialogHeader>
          <DialogTitle className="font-pixel text-calabaza-500">Cómo funciona</DialogTitle>
          <DialogDescription className="text-crimson-800">
            Una noche en Manta con zombies sueltos, en tiempo real.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <strong className="text-calabaza-500">Qué estás viendo.</strong> Cada 2 segundos los zombies se mueven y nuestro motor le
            indica a cada sobreviviente su siguiente paso hacia un refugio, esquivando el peligro. Si una calle se bloquea o aparece una
            horda, las rutas cambian en el turno siguiente.
          </p>
          <p>
            <strong className="text-calabaza-500">Qué puedes hacer.</strong> Toca un sobreviviente o búscalo en la sección Personas para
            seguir su ruta. En Refugios ves cuántos llegaron a cada uno, en Capas eliges qué mostrar y en Alertas lo que acaba de pasar.
          </p>
          <p>
            <strong className="text-calabaza-500">Arriba del panel.</strong> La ronda y el turno, el porcentaje de sobrevivientes con
            vida y el tiempo de respuesta del motor. La leyenda del mapa explica cada ícono y color.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
