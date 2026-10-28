"use client";

import { useEffect, useState } from "react";

// Overlay de depuración para medir el costo de renderizado con 200 sobrevivientes. Solo se muestra con ?debug en la URL.
export default function MedidorFps() {
  const [visible, setVisible] = useState(false);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).has("debug"));
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cuadros = 0;
    let inicio = performance.now();
    let frame = requestAnimationFrame(function medir(ahora) {
      cuadros++;
      if (ahora - inicio >= 1000) {
        setFps(Math.round((cuadros * 1000) / (ahora - inicio)));
        cuadros = 0;
        inicio = ahora;
      }
      frame = requestAnimationFrame(medir);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  if (!visible) return null;
  return (
    <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-card/90 px-2 py-1 font-mono text-xs text-primary">
      {fps} FPS
    </span>
  );
}
