import type { LayerProps } from "react-map-gl/maplibre";
import type { CapaClave } from "@/features/mapa/domain/panel";

// Layers switched off in the Capas tab are hidden with MapLibre's layout visibility:
// no source rebuild and no component per marker.
export const visibilidad = (visible: boolean) => (visible ? "visible" : "none") as "visible" | "none";

export type CapasVisibles = Record<CapaClave, boolean>;

// Zombie types share one symbol layer, so they are filtered by type instead of hidden.
export function filtroZombies(capas: CapasVisibles) {
  const tipos = (["caminante", "corredor", "horda"] as const).filter((t) => capas[t]);
  return ["in", ["get", "tipo"], ["literal", tipos]] as unknown as ["in", ...unknown[]];
}

// Same layer with its visibility set. LayerProps is a union of every layer kind, so the override is
// done here once instead of in each component.
export function conVisibilidad(capa: LayerProps, visible: boolean): LayerProps {
  const layout = "layout" in capa ? capa.layout : undefined;
  return { ...capa, layout: { ...layout, visibility: visibilidad(visible) } } as LayerProps;
}

export function conFiltro(capa: LayerProps, filtro: unknown): LayerProps {
  return { ...capa, filter: filtro } as LayerProps;
}
