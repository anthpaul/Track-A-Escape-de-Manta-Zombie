import { test } from "node:test";
import assert from "node:assert/strict";
import { paddingMapa } from "./padding";

test("desktop: the map centers to the right of the rail and the open panel", () => {
  assert.deepEqual(paddingMapa({ ancho: 1024, alto: 768, panelAbierto: true }), { top: 0, right: 0, bottom: 0, left: 64 + 300 });
  assert.deepEqual(paddingMapa({ ancho: 1024, alto: 768, panelAbierto: false }), { top: 0, right: 0, bottom: 0, left: 64 });
});

test("large screens use the wider panel", () => {
  assert.equal(paddingMapa({ ancho: 1440, alto: 900, panelAbierto: true }).left, 64 + 340);
});

test("phone in portrait: the bottom sheet pushes the center up", () => {
  assert.deepEqual(paddingMapa({ ancho: 390, alto: 844, panelAbierto: true }), { top: 0, right: 0, bottom: 422, left: 0 });
  assert.deepEqual(paddingMapa({ ancho: 390, alto: 844, panelAbierto: false }), { top: 0, right: 0, bottom: 0, left: 0 });
});

test("narrow phone in landscape: rail and panel move to the left side", () => {
  assert.deepEqual(paddingMapa({ ancho: 667, alto: 375, panelAbierto: true }), { top: 0, right: 0, bottom: 0, left: 56 + 288 });
});

test("wide phone in landscape already gets the desktop layout", () => {
  assert.equal(paddingMapa({ ancho: 844, alto: 390, panelAbierto: true }).left, 64 + 300);
});

test("tablet in portrait counts as desktop layout", () => {
  assert.equal(paddingMapa({ ancho: 820, alto: 1180, panelAbierto: true }).left, 64 + 300);
});
