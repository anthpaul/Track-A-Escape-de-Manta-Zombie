import type { LayerProps } from "react-map-gl/maplibre";
import type { CapaClave } from "@/features/mapa/domain/panel";

// Las capas apagadas en la pestaña Capas se ocultan con la propiedad visibility del layout de MapLibre:
// sin reconstruir fuentes y sin un componente por marcador.
export const visibilidad = (visible: boolean) => (visible ? "visible" : "none") as "visible" | "none";

export type CapasVisibles = Record<CapaClave, boolean>;

// Los tipos de zombie comparten una capa de símbolos, así que se filtran por tipo en lugar de ocultarse.
export function filtroZombies(capas: CapasVisibles) {
  const tipos = (["caminante", "corredor", "horda"] as const).filter((t) => capas[t]);
  return ["in", ["get", "tipo"], ["literal", tipos]] as unknown as ["in", ...unknown[]];
}

// La misma capa con su visibilidad definida. LayerProps es una unión de todos los tipos de capa, así que la sobrescritura se
// hace aquí una sola vez en lugar de en cada componente.
export function conVisibilidad(capa: LayerProps, visible: boolean): LayerProps {
  const layout = "layout" in capa ? capa.layout : undefined;
  return { ...capa, layout: { ...layout, visibility: visibilidad(visible) } } as LayerProps;
}

export function conFiltro(capa: LayerProps, filtro: unknown): LayerProps {
  return { ...capa, filter: filtro } as LayerProps;
}
