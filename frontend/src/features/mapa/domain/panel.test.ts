import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoInicialPanel, reducirPanel } from "./panel";

const ini = estadoInicialPanel();

test("starts on the shelters tab with every layer and the route visible", () => {
  assert.equal(ini.tab, "ref");
  assert.ok(Object.values(ini.capas).every(Boolean));
  assert.equal(ini.mostrarRuta, true);
  assert.equal(ini.toastAlertaId, null);
});

test("selecting a shelter opens its tab and clears the selected survivor", () => {
  const s = reducirPanel({ ...ini, tab: "surv", sobrevivienteId: "S-0001" }, { tipo: "seleccionarRefugio", id: "R-01" });
  assert.deepEqual([s.tab, s.refugioId, s.sobrevivienteId], ["ref", "R-01", null]);
});

test("selecting a survivor opens the survivors tab", () => {
  const s = reducirPanel(ini, { tipo: "seleccionarSobreviviente", id: "S-0007" });
  assert.deepEqual([s.tab, s.sobrevivienteId], ["surv", "S-0007"]);
});

test("on-the-way opens survivors filtered by shelter name and on-route status", () => {
  const s = reducirPanel(ini, { tipo: "verEnCamino", nombreRefugio: "Faro de Manta" });
  assert.deepEqual([s.tab, s.busqueda, s.filtro], ["surv", "Faro de Manta", "en_ruta"]);
});

test("layers and the route toggle independently", () => {
  const s = reducirPanel(reducirPanel(ini, { tipo: "alternarCapa", capa: "horda" }), { tipo: "alternarRuta" });
  assert.equal(s.capas.horda, false);
  assert.equal(s.capas.caminante, true);
  assert.equal(s.mostrarRuta, false);
});

test("a new alert opens the toast; closing it keeps it closed until another alert arrives", () => {
  let s = reducirPanel(ini, { tipo: "nuevaAlerta", id: "A1" });
  assert.equal(s.toastAlertaId, "A1");
  s = reducirPanel(s, { tipo: "cerrarToast" });
  assert.equal(s.toastAlertaId, null);
  s = reducirPanel(s, { tipo: "nuevaAlerta", id: "A2" });
  assert.equal(s.toastAlertaId, "A2");
});

test("opening the alerts tab closes the toast", () => {
  const s = reducirPanel({ ...ini, toastAlertaId: "A1" }, { tipo: "abrirAlertas" });
  assert.deepEqual([s.tab, s.toastAlertaId], ["alert", null]);
});

test("locating an alert marks it read and selects its shelter or survivor", () => {
  const a = reducirPanel(ini, { tipo: "ubicarAlerta", alerta: { id: "A1", refugioId: "R-02" } });
  assert.ok(a.alertasLeidas.has("A1"));
  assert.deepEqual([a.tab, a.refugioId], ["ref", "R-02"]);
  const b = reducirPanel(ini, { tipo: "ubicarAlerta", alerta: { id: "A2", sobrevivienteId: "S-0011" } });
  assert.deepEqual([b.tab, b.sobrevivienteId], ["surv", "S-0011"]);
});

test("marking an alert read does not mutate the previous state", () => {
  const s = reducirPanel(ini, { tipo: "marcarLeida", id: "A1" });
  assert.ok(s.alertasLeidas.has("A1"));
  assert.ok(!ini.alertasLeidas.has("A1"));
});
