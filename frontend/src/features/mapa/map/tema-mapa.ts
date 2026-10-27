// Recolors the CARTO Dark Matter base layers into a dark, low-saturation night palette so the base
// map stays in the background and every game color (orange zombies, tide-blue survivors, pink bitten,
// red danger, cream streets) stands out. Pure mapping from layer id/type to paint properties; MapaBase
// applies it once the style loads. Our own game layers are added later and are never touched.

type Capa = { id: string; type: string };
type PropiedadPintura = "background-color" | "fill-color" | "line-color" | "text-color" | "text-halo-color";
type Pintura = [propiedad: PropiedadPintura, valor: string];

// Near-black plum land, deep navy sea (the coastline reads at a glance) and dim grey-plum streets.
const FONDO = "#1b141f";
const AGUA = "#0d2436";
const SUELO = "#1e1622";
const EDIFICIO = "#281e2d";
const CALLE_BORDE = "#120d15";
const CALLE_MENOR = "#2a2131";
const CALLE_MAYOR = "#372c3f";
const VIAS = "#2e2434"; // rail and runways
const LIMITE = "#5a4862";
const TEXTO = "#b9a9c2";
const HALO = "#110c14";

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
