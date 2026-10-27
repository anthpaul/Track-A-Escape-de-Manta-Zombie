import { test } from "node:test";
import assert from "node:assert/strict";
import { pinturaTematica } from "./tema-mapa";

test("background and water take the crimson palette", () => {
  assert.deepEqual(pinturaTematica({ id: "background", type: "background" }), [["background-color", "#3d1030"]]);
  assert.deepEqual(pinturaTematica({ id: "water", type: "fill" }), [["fill-color", "#1a0412"]]);
  assert.deepEqual(pinturaTematica({ id: "waterway", type: "line" }), [["line-color", "#1a0412"]]);
});

test("major road fills are brighter than minor ones, and casings stay dark", () => {
  const [[, mayor]] = pinturaTematica({ id: "road_pri_fill_noramp", type: "line" });
  const [[, menor]] = pinturaTematica({ id: "road_minor_fill", type: "line" });
  const [[, borde]] = pinturaTematica({ id: "road_pri_case_noramp", type: "line" });
  assert.notEqual(mayor, menor);
  assert.equal(borde, "#2e0b22");
});

test("labels keep a readable light text over a dark halo", () => {
  assert.deepEqual(pinturaTematica({ id: "place_city", type: "symbol" }), [
    ["text-color", "#e9a6cb"],
    ["text-halo-color", "#1f0617"],
  ]);
});

test("unknown layers are left untouched", () => {
  assert.deepEqual(pinturaTematica({ id: "something_new", type: "heatmap" }), []);
});
