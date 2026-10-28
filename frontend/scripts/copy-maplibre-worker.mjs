// MapLibre 6 carga su web worker desde un archivo junto a su propio módulo (import.meta.url).
// Los bundlers mueven el módulo a un chunk, por eso servimos el worker desde public/.
// Se ejecuta antes de dev y de build para que el worker siempre coincida con la versión
// instalada de maplibre-gl.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
// Se sirve como .js para que todo host (incluido S3) envíe un tipo MIME de JavaScript.
const target = fileURLToPath(new URL("../public/maplibre-gl-worker.js", import.meta.url));

// public/ puede no existir en un clon nuevo si solo contenía recursos de la plantilla.
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`maplibre worker copied to ${target}`);
