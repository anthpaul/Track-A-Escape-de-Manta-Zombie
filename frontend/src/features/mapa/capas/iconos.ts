// Zombie icons drawn at runtime on a canvas (emoji over a colored disc), so no image assets are needed.
// Registered in MapLibre as "zombie-<tipo>" and referenced by the symbol layer.
export const ICONOS_ZOMBIE = {
  caminante: { emoji: "🧟", color: "#65a30d" },
  corredor: { emoji: "🏃", color: "#ea580c" },
  horda: { emoji: "☠️", color: "#b91c1c" },
} as const;

export type TipoZombieVisible = keyof typeof ICONOS_ZOMBIE;

const TAMANO = 64; // px; rendered at pixelRatio 2 so it stays sharp

export function dibujarIcono(tipo: TipoZombieVisible): ImageData {
  const { emoji, color } = ICONOS_ZOMBIE[tipo];
  const canvas = document.createElement("canvas");
  canvas.width = TAMANO;
  canvas.height = TAMANO;
  const ctx = canvas.getContext("2d")!;

  ctx.beginPath();
  ctx.arc(TAMANO / 2, TAMANO / 2, TAMANO / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0a0a0a";
  ctx.stroke();

  ctx.font = `${TAMANO * 0.55}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, TAMANO / 2, TAMANO / 2 + 2);

  return ctx.getImageData(0, 0, TAMANO, TAMANO);
}
