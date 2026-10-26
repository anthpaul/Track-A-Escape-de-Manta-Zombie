// Map symbology: every color here carries meaning (danger, shelter, survivor, route) and is
// shared by the map layers and the sidebar legend. They are NOT theme tokens on purpose.
export const COLOR_CALLE = {
  avenida: "#f59e0b",
  calle: "#d4d4d4",
  callejon: "#8a8a8a",
  puente: "#38bdf8",
  bloqueada: "#ef4444",
} as const;

export const COLOR_REFUGIO = "#22c55e";
export const COLOR_SOBREVIVIENTE = { en_ruta: "#60a5fa", mordido: "#737373" } as const;
export const COLOR_ZONA_HORDA = "#ef4444";
export const COLOR_RUTA = "#facc15";
export const COLOR_FLECHA = "#93c5fd";
