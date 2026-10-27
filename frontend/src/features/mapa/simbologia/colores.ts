// Map symbology (palette 2): every color here carries meaning and is shared by the map layers
// and the panel legend. They are NOT theme tokens on purpose.
// Walkable network: light, quiet tones so the network reads as background. Orange belongs to
// zombies, pink to bitten survivors and red to danger: streets never reuse those hues.
export const COLOR_CALLE = {
  avenida: "#fee8d3", // calabaza-900
  calle: "#f4bade", // crimson-900, drawn faint
  callejon: "#f4bade", // crimson-900, thinner and fainter than a street
  puente: "#74d1e8", // marea-800
  bloqueada: "#fb3055", // sangre-700: danger, same family as the horde zone
} as const;

export const COLOR_ZOMBIE = { caminante: "#fb8b24", corredor: "#e36414", horda: "#e0052d" } as const;
export const COLOR_REFUGIO = { relleno: "#bae8f4", borde: "#0f4c5c" } as const;
export const COLOR_SOBREVIVIENTE = { en_ruta: "#2fbadd", mordido: "#df319c" } as const;
export const COLOR_ZONA_HORDA = { relleno: "#9a031e", borde: "#fb3055" } as const;
export const COLOR_RUTA = "#2fbadd"; // marea-700, dashed
export const COLOR_FLECHA = "#74d1e8"; // marea-800
export const COLOR_SELECCION = { refugio: "#fb8b24", sobreviviente: "#2fbadd" } as const;
