import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_ZOOM, MANTA_BOUNDS, MANTA_CENTER, MIN_ZOOM } from "./config";

test("Manta center lies inside the allowed bounds", () => {
  const [west, south, east, north] = MANTA_BOUNDS;
  assert.ok(west < MANTA_CENTER.longitude && MANTA_CENTER.longitude < east);
  assert.ok(south < MANTA_CENTER.latitude && MANTA_CENTER.latitude < north);
});

test("initial zoom is not below the minimum zoom", () => {
  assert.ok(INITIAL_ZOOM >= MIN_ZOOM);
});
