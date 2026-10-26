"use client";

import { useEffect, useState } from "react";

// Debug overlay to measure rendering cost with 200 survivors. Shown only with ?debug in the URL.
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
    <span className="absolute bottom-8 left-3 rounded bg-black/80 px-2 py-1 font-mono text-xs text-lime-300">
      {fps} FPS
    </span>
  );
}
