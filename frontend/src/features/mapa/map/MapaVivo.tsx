"use client";

import { useState } from "react";
import MapaBase from "@/features/mapa/map/MapaBase";
import CapaGrafo from "@/features/mapa/map/layers/CapaGrafo";
import CapaVivo from "@/features/mapa/map/layers/CapaVivo";
import CapaSeleccion from "@/features/mapa/map/layers/CapaSeleccion";
import CapaSenales from "@/features/mapa/map/layers/CapaSenales";
import RegistroIconos from "@/features/mapa/map/layers/RegistroIconos";
import AjustePadding from "@/features/mapa/map/AjustePadding";
import BotonCentrar from "@/features/mapa/map/BotonCentrar";
import TarjetaBloqueo from "@/features/mapa/map/TarjetaBloqueo";
import { actualizarBloqueos, type Bloqueos } from "@/features/mapa/domain/bloqueos";
import type { CapasVisibles } from "@/features/mapa/map/layers/visibilidad";
import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";

type Props = {
  grafo: Grafo;
  snapshot: Snapshot;
  aristasBloqueadas: ReadonlySet<string>;
  capas: CapasVisibles;
  anilloSobrevivienteId: string | null;
  refugioId: string | null;
  ruta: string[];
  panelAbierto: boolean;
  onSeleccionarRefugio: (refugioId: string) => void;
  onSeleccionarSobreviviente: (sobrevivienteId: string) => void;
};

// Los clics priorizan un refugio, luego un sobreviviente en camino, luego uno mordido (suelen compartir nodo),
// y luego una señal de tránsito en una calle bloqueada.
const PRIORIDAD = ["refugios", "refugios-base", "sobrevivientes", "mordidos", "senales"];

// Mapa presentacional. Se carga como un único chunk solo de cliente; las capas se dibujan en orden de montaje
// (calles, refugios, flechas y ruta, selección, zonas de horda, sobrevivientes, zombies y señales de tránsito encima).
export default function MapaVivo(props: Props) {
  const { grafo, snapshot, aristasBloqueadas, capas, anilloSobrevivienteId, refugioId, ruta } = props;
  const [senal, setSenal] = useState<string | null>(null);

  // Recuerda desde qué turno está bloqueada cada calle. Se actualiza durante el render cuando llega un snapshot
  // nuevo (patrón de React "ajustar el estado cuando cambia una prop"), así la tarjeta nunca va un turno atrasada.
  const [registro, setRegistro] = useState<{ snapshot: typeof snapshot; bloqueos: Bloqueos } | null>(null);
  let bloqueos = registro?.bloqueos ?? null;
  if (registro?.snapshot !== snapshot) {
    bloqueos = actualizarBloqueos(bloqueos, snapshot.turno, snapshot.aristasBloqueadas);
    setRegistro({ snapshot, bloqueos });
  }

  // La tarjeta se cierra sola cuando su calle se reabre.
  const calleSenal = senal && aristasBloqueadas.has(senal) ? grafo.calles.find((c) => c.id === senal) : undefined;
  const nodoSenal = calleSenal && grafo.nodos.find((n) => n.id === calleSenal.desde);
  const puntoSenal = calleSenal?.geometria[Math.floor(calleSenal.geometria.length / 2)] ?? (nodoSenal ? [nodoSenal.lng, nodoSenal.lat] : null);

  return (
    <MapaBase
      capasInteractivas={PRIORIDAD}
      onClickEntidad={(entidades) => {
        const elegida = PRIORIDAD.map((capa) => entidades.find((e) => e.capa === capa)).find(Boolean);
        if (elegida?.capa === "senales") {
          const calle = elegida.propiedades.calle;
          if (typeof calle === "string") setSenal(calle);
          return;
        }
        const id = elegida?.propiedades.id;
        if (typeof id !== "string") return;
        if (elegida!.capa.startsWith("refugios")) props.onSeleccionarRefugio(id);
        else props.onSeleccionarSobreviviente(id);
      }}
    >
      <RegistroIconos />
      <CapaGrafo grafo={grafo} aristasBloqueadas={aristasBloqueadas} refugiosVisibles={capas.refugio} />
      <CapaSeleccion
        grafo={grafo}
        snapshot={snapshot}
        anilloSobrevivienteId={anilloSobrevivienteId}
        refugioId={refugioId}
        ruta={ruta}
        flechasVisibles={capas.sobreviviente}
      />
      <CapaVivo grafo={grafo} snapshot={snapshot} capas={capas} />
      <CapaSenales grafo={grafo} aristasBloqueadas={aristasBloqueadas} />
      {calleSenal && puntoSenal && (
        <TarjetaBloqueo
          lng={puntoSenal[0]}
          lat={puntoSenal[1]}
          tipo={calleSenal.tipo}
          desde={bloqueos?.desde.get(calleSenal.id) ?? null}
          onCerrar={() => setSenal(null)}
        />
      )}
      <AjustePadding panelAbierto={props.panelAbierto} />
      <BotonCentrar />
    </MapaBase>
  );
}
