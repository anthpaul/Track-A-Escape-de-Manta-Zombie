// Padding del mapa para que el centro visible nunca quede detrás del riel o del panel.
// Estos tamaños replican las clases de Tailwind de RielIconos y PanelLateral: cambiarlos juntos.
export const DISENO = {
  escritorioDesde: 768, // md
  panelAnchoDesde: 1280, // xl
  riel: 64, // w-16
  rielHorizontal: 56, // w-14, teléfono en horizontal
  panel: 300, // w-[300px]
  panelAncho: 340, // xl:w-[340px]
  panelHorizontal: 288, // w-72, teléfono en horizontal
  hojaMovil: 0.5, // max-h-[50dvh], hoja inferior en teléfonos en vertical
} as const;

type Padding = { top: number; right: number; bottom: number; left: number };

export function paddingMapa({ ancho, alto, panelAbierto }: { ancho: number; alto: number; panelAbierto: boolean }): Padding {
  const base: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

  if (ancho >= DISENO.escritorioDesde) {
    const panel = ancho >= DISENO.panelAnchoDesde ? DISENO.panelAncho : DISENO.panel;
    return { ...base, left: DISENO.riel + (panelAbierto ? panel : 0) };
  }
  // Teléfono en horizontal: el riel y el panel pasan a la izquierda, como en escritorio pero más angostos.
  if (ancho > alto) {
    return { ...base, left: DISENO.rielHorizontal + (panelAbierto ? DISENO.panelHorizontal : 0) };
  }
  // Teléfono en vertical: la hoja inferior cubre hasta la mitad de la altura de la pantalla.
  return { ...base, bottom: panelAbierto ? Math.round(alto * DISENO.hojaMovil) : 0 };
}
