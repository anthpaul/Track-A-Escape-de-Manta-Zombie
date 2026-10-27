import assert from "node:assert/strict";
import { test } from "node:test";
import { calentar, parseArgsCalentar, veredicto } from "./calentar";
import type { ClienteMotor, PedidoPaso } from "./motor-falso";

// Fake motor that records every request and how many were in flight at once.
function motorFalso(opciones: { demoraMs?: number; fallarCada?: number } = {}) {
  const pedidos: PedidoPaso[] = [];
  let enVuelo = 0;
  let maxEnVuelo = 0;
  const motor: ClienteMotor = {
    async pedirPaso(pedido) {
      pedidos.push(pedido);
      const numero = pedidos.length;
      enVuelo++;
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
      await new Promise((r) => setTimeout(r, opciones.demoraMs ?? 5));
      enVuelo--;
      if (opciones.fallarCada && numero % opciones.fallarCada === 0) throw new Error("boom");
      return { siguienteNodo: pedido.nodoActual };
    },
  };
  return { motor, pedidos, maxEnVuelo: () => maxEnVuelo };
}

test("each wave fires every request at the same time, like a 200-survivor turn", async () => {
  const f = motorFalso();
  const oleadas = await calentar({ motor: f.motor, concurrencia: 40, oleadas: 3, pausaMs: 0, nodo: "N-0001" });
  assert.equal(oleadas.length, 3);
  assert.equal(f.pedidos.length, 120);
  assert.equal(f.maxEnVuelo(), 40, "a wave must be concurrent, not sequential");
});

test("requests follow the /paso contract with distinct survivors", async () => {
  const f = motorFalso();
  await calentar({ motor: f.motor, concurrencia: 12, oleadas: 1, pausaMs: 0, nodo: "N-0001" });
  for (const p of f.pedidos) {
    assert.match(p.sobrevivienteId, /^S-\d{4}$/);
    assert.equal(p.nodoActual, "N-0001");
    assert.ok(Number.isInteger(p.turno) && p.turno >= 0);
  }
  assert.equal(new Set(f.pedidos.map((p) => p.sobrevivienteId)).size, 12);
});

test("each wave reports its errors and latency percentiles", async () => {
  const f = motorFalso({ demoraMs: 2, fallarCada: 5 });
  const [oleada] = await calentar({ motor: f.motor, concurrencia: 20, oleadas: 1, pausaMs: 0, nodo: "N-0001" });
  assert.equal(oleada.oleada, 1);
  assert.equal(oleada.pedidos, 20);
  assert.equal(oleada.errores, 4);
  assert.ok(oleada.p50Ms > 0 && oleada.p95Ms >= oleada.p50Ms && oleada.maxMs >= oleada.p95Ms);
});

test("the instances are ready only when the last wave has no errors and p95 within 150 ms", () => {
  const base = { oleada: 3, pedidos: 200, errores: 0, p50Ms: 40, p95Ms: 120, maxMs: 200 };
  assert.equal(veredicto([base]).listo, true);
  assert.equal(veredicto([{ ...base, errores: 1 }]).listo, false);
  assert.equal(veredicto([{ ...base, p95Ms: 151 }]).listo, false);
  // Only the last wave matters: the first one is expected to hit cold starts.
  assert.equal(veredicto([{ ...base, oleada: 1, p95Ms: 900, errores: 30 }, base]).listo, true);
});

test("CLI defaults match the R3 load and reject nonsense", () => {
  assert.deepEqual(parseArgsCalentar([]), { concurrencia: 200, oleadas: 3, pausaMs: 1000 });
  assert.deepEqual(parseArgsCalentar(["--concurrencia=80", "--oleadas=2", "--pausa=500"]), { concurrencia: 80, oleadas: 2, pausaMs: 500 });
  assert.throws(() => parseArgsCalentar(["--concurrencia=0"]));
  assert.throws(() => parseArgsCalentar(["--oleadas=abc"]));
  assert.throws(() => parseArgsCalentar(["--desconocido=1"]));
});
