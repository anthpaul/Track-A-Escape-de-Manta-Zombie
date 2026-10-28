import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRound, UserRoundX } from "lucide-react";
import { COLOR_SOBREVIVIENTE } from "@/features/mapa/simbologia/colores";
import { clipPathForma, ICONOS_MAPA, svgIconoMapa } from "@/features/mapa/simbologia/iconos";

const decodificar = (url: string) => decodeURIComponent(url.replace("data:image/svg+xml;charset=utf-8,", ""));

test("a badge wraps the Lucide svg in a 64x64 svg with a colored disc", () => {
  const svg = decodificar(svgIconoMapa('<svg width="32" height="32"><path d="M1 1"/></svg>', "#b91c1c"));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64">/);
  assert.match(svg, /<circle[^>]*fill="#b91c1c"/);
  assert.match(svg, /<g transform="translate\(16 16\)"><svg width="32" height="32"><path d="M1 1"\/><\/svg><\/g>/);
});

test("a square badge draws a rounded rect with its own border color", () => {
  const svg = decodificar(svgIconoMapa("<svg/>", "#bae8f4", "cuadrado", "#0f4c5c"));
  assert.match(svg, /<rect[^>]*fill="#bae8f4"[^>]*stroke="#0f4c5c"/);
  assert.doesNotMatch(svg, /<circle/);
});

test("an icon without background has no disc", () => {
  assert.doesNotMatch(decodificar(svgIconoMapa("<svg/>", null)), /<circle/);
});

test("every map image referenced by the layers is defined", () => {
  for (const nombre of ["zombie-caminante", "zombie-corredor", "zombie-horda", "refugio", "flecha", "anillo-refugio"]) {
    assert.ok(ICONOS_MAPA[nombre], `missing map icon ${nombre}`);
  }
});

test("every entity on the map has its own shape: never a circle, never a triangle, never repeated", () => {
  const entidades = ["zombie-caminante", "zombie-corredor", "zombie-horda", "refugio", "vehiculo"];
  const formas = entidades.map((n) => ICONOS_MAPA[n]!.forma);
  assert.deepEqual(formas, ["rombo", "hexagono", "octagono", "cuadrado", "pentagono"]);
  assert.equal(new Set(formas).size, entidades.length);
});

test("a polygon badge draws the shape with as many corners as it has, and no disc", () => {
  const puntos = (forma: "rombo" | "hexagono" | "octagono" | "pentagono") =>
    /<polygon points="([^"]+)"/.exec(decodificar(svgIconoMapa("<svg/>", "#fb8b24", forma)))![1]!.trim().split(" ").length;
  assert.deepEqual([puntos("rombo"), puntos("pentagono"), puntos("hexagono"), puntos("octagono")], [4, 5, 6, 8]);
  assert.doesNotMatch(decodificar(svgIconoMapa("<svg/>", "#fb8b24", "hexagono")), /<circle/);
});

test("the legend cuts the same shapes with CSS", () => {
  assert.equal(clipPathForma("rombo"), "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)");
});

test("people are a disc in their state color with a black person icon inside, so the icon reads", () => {
  const persona = ICONOS_MAPA.persona!;
  const mordida = ICONOS_MAPA["persona-mordida"]!;
  assert.deepEqual([persona.Icono, persona.fondo, persona.forma ?? "disco", persona.trazo], [UserRound, COLOR_SOBREVIVIENTE.en_ruta, "disco", "#13030d"]);
  assert.deepEqual([mordida.Icono, mordida.fondo, mordida.forma ?? "disco", mordida.trazo], [UserRoundX, COLOR_SOBREVIVIENTE.mordido, "disco", "#13030d"]);
});

test("an icon can still get a dark outline drawn behind it", () => {
  const svg = decodificar(svgIconoMapa('<svg stroke="#2fbadd" stroke-width="2.75"><path d="M1 1"/></svg>', null, "disco", "#000", "#13030d"));
  // The dark outline is drawn first and wider; the colored icon goes on top.
  assert.match(svg, /<svg stroke="#13030d" stroke-width="[\d.]+"><path d="M1 1"\/><\/svg>.*<svg stroke="#2fbadd" stroke-width="2.75">/);
});
