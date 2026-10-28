// Recolorea las capas base de CARTO Dark Matter con una paleta nocturna oscura y poco saturada, para que el mapa
// base quede de fondo y resalte cada color del juego (zombies naranjas, sobrevivientes azul marea, mordidos rosas,
// peligro rojo, calles crema). Mapeo puro de id/tipo de capa a propiedades de paint; MapaBase
// lo aplica cuando carga el estilo. Nuestras capas del juego se agregan después y nunca se tocan.

type Capa = { id: string; type: string };
type PropiedadPintura = "background-color" | "fill-color" | "line-color" | "text-color" | "text-halo-color";
type Pintura = [propiedad: PropiedadPintura, valor: string];

// Tierra ciruela casi negra, mar azul marino profundo (la costa se lee de un vistazo) y calles gris ciruela tenues.
const FONDO = "#1b141f";
const AGUA = "#0d2436";
const SUELO = "#1e1622";
const EDIFICIO = "#281e2d";
const CALLE_BORDE = "#120d15";
const CALLE_MENOR = "#2a2131";
const CALLE_MAYOR = "#372c3f";
const VIAS = "#2e2434"; // vías férreas y pistas de aterrizaje
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
