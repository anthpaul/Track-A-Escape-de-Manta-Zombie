import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MotorHttp } from "./motor-http";

// A /paso that answers after `demoraMs`, like a Lambda still starting up.
async function servidorLento(demoraMs: number) {
  const servidor = createServer((_, res) => {
    setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end('{"siguienteNodo":"N-0002"}'), demoraMs);
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/paso`;
  return { url, cerrar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}

const pedido = { sobrevivienteId: "S-0001", nodoActual: "N-0001", turno: 1 };

test("the official 500 ms cut stays the default: a slower answer is a failure", async () => {
  const s = await servidorLento(700);
  try {
    await assert.rejects(new MotorHttp({ url: s.url, apiKey: "k" }).pedirPaso(pedido));
  } finally {
    await s.cerrar();
  }
});

test("a longer timeout waits for a slow answer, so a warm-up never abandons a starting instance", async () => {
  const s = await servidorLento(700);
  try {
    const motor = new MotorHttp({ url: s.url, apiKey: "k", timeoutMs: 3000 });
    assert.deepEqual(await motor.pedirPaso(pedido), { siguienteNodo: "N-0002" });
    assert.equal(motor.latencias.length, 1);
  } finally {
    await s.cerrar();
  }
});
