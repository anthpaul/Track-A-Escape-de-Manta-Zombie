import assert from "node:assert/strict";
import { test } from "node:test";
import { p95DeLatencias } from "./metricas";

test("the live p95 uses every /paso latency of the round so far, nearest rank", () => {
  const latencias = Array.from({ length: 100 }, (_, i) => i + 1); // de 1 a 100 ms
  assert.equal(p95DeLatencias(latencias), 95);
  assert.equal(p95DeLatencias([300, 10, 20]), 300, "order does not matter");
});

test("with no latency measured yet there is no p95, never a fake zero", () => {
  assert.equal(p95DeLatencias([]), null);
});

test("computing it never reorders the motor's own latency log", () => {
  const latencias = [30, 10, 20];
  p95DeLatencias(latencias);
  assert.deepEqual(latencias, [30, 10, 20]);
});
