// Simbología del mapa (paleta 2): cada color de aquí tiene un significado y lo comparten las capas del mapa
// y la leyenda del panel. A propósito NO son tokens del tema.
// Red caminable: tonos claros y discretos para que la red se lea como fondo. El naranja es de los
// zombies, el rosa de los sobrevivientes mordidos y el rojo del peligro: las calles nunca reutilizan esos tonos.
export const COLOR_CALLE = {
  avenida: "#fee8d3", // calabaza-900
  calle: "#f4bade", // crimson-900, dibujada tenue
  callejon: "#f4bade", // crimson-900, más delgado y tenue que una calle
  puente: "#74d1e8", // marea-800
  bloqueada: "#fb3055", // sangre-700: peligro, misma familia que la zona de horda
  // Puente dañado: el naranja de las señales de advertencia; la línea doble punteada y el triángulo lo distinguen de un zombie.
  danado: "#fb8b24", // calabaza-500
} as const;

export const COLOR_ZOMBIE = { caminante: "#fb8b24", corredor: "#e36414", horda: "#e0052d" } as const;
export const COLOR_REFUGIO = { relleno: "#bae8f4", borde: "#0f4c5c" } as const;
export const COLOR_SOBREVIVIENTE = { en_ruta: "#2fbadd", mordido: "#df319c" } as const;
export const COLOR_ZONA_HORDA = { relleno: "#9a031e", borde: "#fb3055" } as const;
// Camioneta de rescate (Pro): insignia crema, la única forma clara del mapa que no es una persona ni un zombie.
export const COLOR_VEHICULO = { relleno: "#fee8d3", borde: "#13030d" } as const; // calabaza-900
export const COLOR_RUTA = "#2fbadd"; // marea-700, punteada
export const COLOR_FLECHA = "#74d1e8"; // marea-800
export const COLOR_SELECCION = { refugio: "#fb8b24", sobreviviente: "#2fbadd" } as const;
