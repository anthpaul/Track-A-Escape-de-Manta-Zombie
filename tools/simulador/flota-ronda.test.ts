import assert from "node:assert/strict";
import { test } from "node:test";
import { crearEscenarioR3 } from "./escenarios";
import { crearMotorEnProceso } from "./motor-en-proceso";
import { crearPersistenciaMemoria } from "./persistencia";
import { crearRelojFake } from "./reloj";
import { correrRonda, type ConfigRonda } from "./turno";

test("evaluation rounds have no fleet: the fire test stays exactly as it was", () => {
  assert.equal(crearEscenarioR3({ semilla: 1 }).config.flota, undefined);
});

test("a round with the fleet rescues people, publishes the five vans and never asks /paso for a rider", async () => {
  let vivo: ConfigRonda | undefined;
  const pedidosDeQuienViajaba: string[] = [];
  const base = crearMotorEnProceso(() => vivo?.zombies ?? [], () => vivo?.aristasBloqueadas ?? [], () => vivo?.sobrevivientes ?? []);
  const motor = {
    async pedirPaso(pedido: { sobrevivienteId: string; nodoActual: string; turno: number }) {
      if (vivo?.sobrevivientes.find((s) => s.id === pedido.sobrevivienteId)?.vehiculo) pedidosDeQuienViajaba.push(pedido.sobrevivienteId);
      return base.pedirPaso(pedido);
    },
  };
  const persistencia = crearPersistenciaMemoria();
  const { config } = crearEscenarioR3({ semilla: 7, motor, persistencia, reloj: crearRelojFake(), flota: true });
  vivo = config;
  const resultados = await correrRonda(config);

  assert.deepEqual(pedidosDeQuienViajaba, []);
  const rescatados = resultados.reduce((t, r) => t + (r.rescatadosFlota ?? 0), 0);
  assert.ok(rescatados > 0, "the vans brought someone to a shelter");
  const ultimo = await persistencia.leerUltimoTurnoCompleto();
  assert.equal(ultimo?.vehiculos?.length, 5);
  // Nobody is left riding a van as bitten, and every rider is still on the road.
  assert.ok(config.sobrevivientes.every((s) => !s.vehiculo || s.estado === "en_ruta"));
});
