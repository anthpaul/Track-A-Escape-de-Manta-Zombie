// Map padding so the visible center is never hidden behind the rail or the panel.
// These sizes mirror the Tailwind classes of RielIconos and PanelLateral: change them together.
export const DISENO = {
  escritorioDesde: 768, // md
  panelAnchoDesde: 1280, // xl
  riel: 64, // w-16
  rielHorizontal: 56, // w-14, phone in landscape
  panel: 300, // w-[300px]
  panelAncho: 340, // xl:w-[340px]
  panelHorizontal: 288, // w-72, phone in landscape
  hojaMovil: 0.5, // max-h-[50dvh], bottom sheet on phones in portrait
} as const;

type Padding = { top: number; right: number; bottom: number; left: number };

export function paddingMapa({ ancho, alto, panelAbierto }: { ancho: number; alto: number; panelAbierto: boolean }): Padding {
  const base: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

  if (ancho >= DISENO.escritorioDesde) {
    const panel = ancho >= DISENO.panelAnchoDesde ? DISENO.panelAncho : DISENO.panel;
    return { ...base, left: DISENO.riel + (panelAbierto ? panel : 0) };
  }
  // Phone in landscape: rail and panel move to the left, like on desktop but narrower.
  if (ancho > alto) {
    return { ...base, left: DISENO.rielHorizontal + (panelAbierto ? DISENO.panelHorizontal : 0) };
  }
  // Phone in portrait: the bottom sheet covers up to half of the screen height.
  return { ...base, bottom: panelAbierto ? Math.round(alto * DISENO.hojaMovil) : 0 };
}
