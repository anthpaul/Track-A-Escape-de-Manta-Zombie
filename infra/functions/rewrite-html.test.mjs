// Tests for the CloudFront viewer-request function. Run: node --test infra/functions/rewrite-html.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The file is plain CloudFront JS (no exports), so it is evaluated to get its handler.
const codigo = readFileSync(new URL("./rewrite-html.js", import.meta.url), "utf-8");
const handler = new Function(`${codigo}; return handler;`)();
const reescribir = (uri) => handler({ request: { uri } }).uri;

test("Next payloads requested with dots are served from the exported folder", () => {
  assert.equal(reescribir("/mapa/__next.mapa.__PAGE__.txt"), "/mapa/__next.mapa/__PAGE__.txt");
});

test("payloads that already match an exported file are left alone", () => {
  assert.equal(reescribir("/__next.__PAGE__.txt"), "/__next.__PAGE__.txt");
  assert.equal(reescribir("/mapa/__next._full.txt"), "/mapa/__next._full.txt");
  assert.equal(reescribir("/mapa/__next._tree.txt"), "/mapa/__next._tree.txt");
});

test("clean URLs still map to their .html files", () => {
  assert.equal(reescribir("/"), "/index.html");
  assert.equal(reescribir("/mapa"), "/mapa.html");
  assert.equal(reescribir("/mapa/"), "/mapa.html");
});

test("static assets keep their path", () => {
  assert.equal(reescribir("/_next/static/chunks/abc.js"), "/_next/static/chunks/abc.js");
  assert.equal(reescribir("/maplibre-gl-worker.js"), "/maplibre-gl-worker.js");
  assert.equal(reescribir("/mapa.txt"), "/mapa.txt");
});
