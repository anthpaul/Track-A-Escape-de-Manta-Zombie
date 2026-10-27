// Recolors the CARTO Dark Matter base layers with palette 2 so the whole map reads crimson,
// like the reference design. Pure mapping from layer id/type to paint properties; MapaBase
// applies it once the style loads. Our own game layers are added later and are never touched.

type Capa = { id: string; type: string };
type PropiedadPintura = "background-color" | "fill-color" | "line-color" | "text-color" | "text-halo-color";
type Pintura = [propiedad: PropiedadPintura, valor: string];

const FONDO = "#3d1030";
const AGUA = "#1a0412";
const SUELO = "#45143a";
const EDIFICIO = "#521a44";
const CALLE_BORDE = "#2e0b22";
const CALLE_MENOR = "#6b2a55";
const CALLE_MAYOR = "#86386a";
const VIAS = "#5a2048"; // rail and runways
const LIMITE = "#8a3a6e";
const TEXTO = "#e9a6cb";
const HALO = "#1f0617";

const esMayor = (id: string) => /_(pri|sec|trunk|mot)_/.test(id);

export function pinturaTematica({ id, type }: Capa): Pintura[] {
  if (type === "background") return [["background-color", FONDO]];
  if (type === "symbol") return [["text-color", TEXTO], ["text-halo-color", HALO]];

  if (type === "fill") {
    if (id.startsWith("water")) return [["fill-color", AGUA]];
    if (id.startsWith("building")) return [["fill-color", EDIFICIO]];
    return [["fill-color", SUELO]];
  }

  if (type === "line") {
    if (id.startsWith("water")) return [["line-color", AGUA]];
    if (id.startsWith("boundary")) return [["line-color", LIMITE]];
    if (id.startsWith("rail") || id.includes("_rail") || id.startsWith("aeroway")) return [["line-color", VIAS]];
    if (/^(road|tunnel|bridge)_/.test(id)) {
      if (id.includes("_case")) return [["line-color", CALLE_BORDE]];
      return [["line-color", esMayor(id) ? CALLE_MAYOR : CALLE_MENOR]];
    }
  }

  return [];
}
