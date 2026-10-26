// MapLibre 6 loads its web worker from a file next to its own module (import.meta.url).
// Bundlers move the module into a chunk, so we serve the worker from public/ instead.
// Runs before dev and build so the worker always matches the installed maplibre-gl version.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
// Served as .js so every host (including S3) sends a JavaScript MIME type.
const target = fileURLToPath(new URL("../public/maplibre-gl-worker.js", import.meta.url));

copyFileSync(source, target);
console.log(`maplibre worker copied to ${target}`);
