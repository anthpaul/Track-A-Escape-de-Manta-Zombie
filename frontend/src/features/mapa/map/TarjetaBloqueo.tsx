"use client";

import { Popup } from "react-map-gl/maplibre";
import { textoBloqueo } from "@/features/mapa/domain/bloqueos";
import type { TipoCalle } from "@/features/mapa/domain/tipos";

type Props = { lng: number; lat: number; tipo: TipoCalle; desde: number | null; onCerrar: () => void };

// Tarjeta que aparece al tocar una señal de tránsito (S1): qué está bloqueado y desde qué turno.
export default function TarjetaBloqueo({ lng, lat, tipo, desde, onCerrar }: Props) {
  const { titulo, detalle } = textoBloqueo(tipo, desde);
  return (
    <Popup longitude={lng} latitude={lat} anchor="left" offset={16} closeButton={false} onClose={onCerrar} className="popup-mapa">
      <div role="status" className="rounded-lg border border-calabaza-500 bg-crimson-100/95 px-3 py-2 shadow-lg">
        <p className="text-sm font-semibold text-calabaza-900">{titulo}</p>
        <p className="text-xs text-crimson-800">{detalle}</p>
      </div>
    </Popup>
  );
}
