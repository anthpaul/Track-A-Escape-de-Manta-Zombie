import { test } from "node:test";
import assert from "node:assert/strict";
import { ICONOS_MAPA, svgIconoMapa } from "@/features/mapa/simbologia/iconos";

const decodificar = (url: string) => decodeURIComponent(url.replace("data:image/svg+xml;charset=utf-8,", ""));

test("a badge wraps the Lucide svg in a 64x64 svg with a colored disc", () => {
  const svg = decodificar(svgIconoMapa('<svg width="32" height="32"><path d="M1 1"/></svg>', "#b91c1c"));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64">/);
  assert.match(svg, /<circle[^>]*fill="#b91c1c"/);
  assert.match(svg, /<g transform="translate\(16 16\)"><svg width="32" height="32"><path d="M1 1"\/><\/svg><\/g>/);
});

test("an icon without background has no disc", () => {
  assert.doesNotMatch(decodificar(svgIconoMapa("<svg/>", null)), /<circle/);
});

test("every map image referenced by the layers is defined", () => {
  for (const nombre of ["zombie-caminante", "zombie-corredor", "zombie-horda", "refugio", "flecha"]) {
    assert.ok(ICONOS_MAPA[nombre], `missing map icon ${nombre}`);
  }
});
