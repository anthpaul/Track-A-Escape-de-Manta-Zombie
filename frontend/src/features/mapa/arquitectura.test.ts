import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// Guards the inward dependency rule documented in README.md, so it cannot erode silently.
const RAIZ = __dirname;

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !nombre.endsWith(".test.ts") ? [ruta] : [];
  });
}

// Relative imports are resolved to "@/features/mapa/..." so "../../map/x" cannot sneak past the rules.
function importsDe(ruta: string): string[] {
  const fuente = readFileSync(ruta, "utf-8");
  return [...fuente.matchAll(/from\s+"([^"]+)"|import\("([^"]+)"\)/g)].map((m) => {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith(".")) return spec;
    const absoluto = relative(join(RAIZ, "..", ".."), resolve(dirname(ruta), spec)).split(sep).join("/");
    return `@/${absoluto}`;
  });
}

const capa = (ruta: string) => relative(RAIZ, ruta).split(sep)[0];

// layer → what it must never import
const PROHIBIDO: Record<string, RegExp[]> = {
  domain: [/^react/, /maplibre/, /^next/, /^lucide-react$/, /features\/mapa\/(map|data|ui|simbologia)\//],
  simbologia: [/maplibre/, /features\/mapa\/(map|data|ui)\//],
  map: [/features\/mapa\/(data|ui)\//],
  data: [/maplibre/, /features\/mapa\/(map|ui)\//],
  ui: [/maplibre/, /features\/mapa\/(map|data)\//],
};

test("every layer only depends inward", () => {
  const violaciones: string[] = [];
  for (const ruta of archivos(RAIZ)) {
    const reglas = PROHIBIDO[capa(ruta)] ?? [];
    for (const spec of importsDe(ruta)) {
      if (reglas.some((r) => r.test(spec))) violaciones.push(`${relative(RAIZ, ruta)} → ${spec}`);
    }
  }
  assert.deepEqual(violaciones, []);
});

test("the rest of the app only reaches the feature through index.ts", () => {
  const app = join(RAIZ, "..", "..", "app");
  const profundos = archivos(app).flatMap((ruta) =>
    importsDe(ruta).filter((s) => s.startsWith("@/features/mapa/")).map((s) => `${relative(app, ruta)} → ${s}`),
  );
  assert.deepEqual(profundos, []);
});
