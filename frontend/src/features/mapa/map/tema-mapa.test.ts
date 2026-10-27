import { test } from "node:test";
import assert from "node:assert/strict";
import { pinturaTematica } from "./tema-mapa";

test("background and water take the dark night palette", () => {
  assert.deepEqual(pinturaTematica({ id: "background", type: "background" }), [["background-color", "#1b141f"]]);
  assert.deepEqual(pinturaTematica({ id: "water", type: "fill" }), [["fill-color", "#0d2436"]]);
  assert.deepEqual(pinturaTematica({ id: "waterway", type: "line" }), [["line-color", "#0d2436"]]);
});

test("major road fills are brighter than minor ones, and casings stay dark", () => {
  const [[, mayor]] = pinturaTematica({ id: "road_pri_fill_noramp", type: "line" });
  const [[, menor]] = pinturaTematica({ id: "road_minor_fill", type: "line" });
  const [[, borde]] = pinturaTematica({ id: "road_pri_case_noramp", type: "line" });
  assert.notEqual(mayor, menor);
  assert.equal(borde, "#120d15");
});

test("labels keep a readable light text over a dark halo", () => {
  assert.deepEqual(pinturaTematica({ id: "place_city", type: "symbol" }), [
    ["text-color", "#b9a9c2"],
    ["text-halo-color", "#110c14"],
  ]);
});

test("unknown layers are left untouched", () => {
  assert.deepEqual(pinturaTematica({ id: "something_new", type: "heatmap" }), []);
});
