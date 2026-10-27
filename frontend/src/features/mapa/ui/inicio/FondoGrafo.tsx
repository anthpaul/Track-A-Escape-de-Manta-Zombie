import { useMemo } from "react";
import type { Grafo } from "@/features/mapa/domain/tipos";

// Decorative background: the real street graph of Manta, drawn faintly. Static SVG, no map library.
export default function FondoGrafo({ grafo }: { grafo: Grafo }) {
  const { caminos, caja } = useMemo(() => {
    const lngs = grafo.nodos.map((n) => n.lng);
    const lats = grafo.nodos.map((n) => n.lat);
    const caja = { x: Math.min(...lngs), y: Math.min(...lats), w: Math.max(...lngs) - Math.min(...lngs), h: Math.max(...lats) - Math.min(...lats) };
    const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
    // Latitude grows north, SVG y grows down: flip it.
    const punto = ([lng, lat]: [number, number]) => `${(lng - caja.x).toFixed(5)},${(caja.y + caja.h - lat).toFixed(5)}`;
    const caminos = grafo.calles.flatMap((c) => {
      const desde = nodos.get(c.desde);
      const hasta = nodos.get(c.hasta);
      const coords = c.geometria.length >= 2 ? c.geometria : desde && hasta ? [[desde.lng, desde.lat] as [number, number], [hasta.lng, hasta.lat] as [number, number]] : [];
      return coords.length >= 2 ? [{ id: c.id, avenida: c.tipo === "avenida", d: `M${coords.map(punto).join("L")}` }] : [];
    });
    return { caminos, caja };
  }, [grafo]);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${caja.w} ${caja.h}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {caminos.map(({ id, avenida, d }) => (
        <path
          key={id}
          d={d}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={avenida ? 2 : 1}
          className={avenida ? "stroke-calabaza-500/70" : "stroke-crimson-700/60"}
        />
      ))}
    </svg>
  );
}
