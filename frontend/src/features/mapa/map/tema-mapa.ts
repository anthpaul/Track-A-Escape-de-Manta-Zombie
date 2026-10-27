// Recolors the CARTO Dark Matter base layers with palette 2 so the whole map reads crimson,
// like the reference design. Pure mapping from layer id/type to paint properties; MapaBase
// applies it once the style loads. Our own game layers are added later and are never touched.

type Capa = { id: string; type: string };
type PropiedadPintura = "background-color" | "fill-color" | "line-color" | "text-color" | "text-halo-color";
type Pintura = [propiedad: PropiedadPintura, valor: string];

// Dusty mauve land with lighter streets and dark crimson water, matched to the reference design.
const FONDO = "#5a2d48";
const AGUA = "#2b0a20";
const SUELO = "#5e304c";
const EDIFICIO = "#683656";
const CALLE_BORDE = "#4a2139";
const CALLE_MENOR = "#7c4867";
const CALLE_MAYOR = "#93587b";
const VIAS = "#6f3b5c"; // rail and runways
const LIMITE = "#a06a8a";
const TEXTO = "#f1cfe0";
const HALO = "#3b1530";

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
