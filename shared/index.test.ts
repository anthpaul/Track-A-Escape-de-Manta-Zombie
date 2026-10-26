import { test } from "node:test";
import assert from "node:assert/strict";
import { PasoInputSchema, PasoOutputSchema } from "./index";

test("accepts the official /paso example body", () => {
  const body = { sobrevivienteId: "S-0089", nodoActual: "N-0117", turno: 142 };
  assert.deepEqual(PasoInputSchema.parse(body), body);
});

test("accepts the official /paso example response", () => {
  assert.deepEqual(PasoOutputSchema.parse({ siguienteNodo: "N-0118" }), { siguienteNodo: "N-0118" });
});

test("rejects ids that do not follow the contract format", () => {
  assert.equal(PasoInputSchema.safeParse({ sobrevivienteId: "89", nodoActual: "N-0117", turno: 1 }).success, false);
  assert.equal(PasoInputSchema.safeParse({ sobrevivienteId: "S-0089", nodoActual: "117", turno: 1 }).success, false);
});

test("rejects negative or fractional turns", () => {
  assert.equal(PasoInputSchema.safeParse({ sobrevivienteId: "S-0089", nodoActual: "N-0117", turno: -1 }).success, false);
  assert.equal(PasoInputSchema.safeParse({ sobrevivienteId: "S-0089", nodoActual: "N-0117", turno: 1.5 }).success, false);
});
