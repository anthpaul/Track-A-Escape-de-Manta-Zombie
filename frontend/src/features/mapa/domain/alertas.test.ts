import { test } from "node:test";
import assert from "node:assert/strict";
import { derivarAlertas } from "./alertas";
import type { Grafo, Snapshot } from "./tipos";

const grafo: Grafo = {
  version: "t",
  nodos: [
    { id: "N-0001", lat: -0.95, lng: -80.72 },
    { id: "N-0002", lat: -0.95, lng: -80.71 },
    { id: "N-0003", lat: -0.95, lng: -80.7 },
  ],
  calles: [
    { id: "C-0001", desde: "N-0001", hasta: "N-0002", distancia_m: 100, tipo: "puente", geometria: [] },
    { id: "C-0002", desde: "N-0002", hasta: "N-0003", distancia_m: 100, tipo: "calle", geometria: [] },
  ],
  refugios: [{ id: "R-01", nodo: "N-0003", nombre: "Faro de Manta", capacidad: 2 }],
};

const snap = (p: Partial<Snapshot>): Snapshot => ({
  turno: 1,
  ronda: 2,
  zombies: [],
  aristasBloqueadas: [],
  sobrevivientes: [],
  refugios: [{ id: "R-01", ocupacion: 0, capacidad: 2 }],
  metricas: { vivos: 0, aSalvo: 0, mordidos: 0, p95ms: null },
  generadoEn: "x",
  ...p,
});

test("nothing changed means no alerts", () => {
  assert.deepEqual(derivarAlertas(grafo, snap({}), snap({ turno: 2 })), []);
});

test("a new horde raises an alert near the closest shelter", () => {
  const [a] = derivarAlertas(grafo, snap({}), snap({ turno: 2, zombies: [{ id: "Z-1", tipo: "horda", nodo: "N-0002" }] }));
  assert.equal(a.tipo, "horda");
  assert.equal(a.titulo, "Horda detectada");
  assert.equal(a.refugioId, "R-01");
  assert.match(a.descripcion, /Faro de Manta/);
});

test("a collapsed bridge and a blocked street are told apart, without street codes", () => {
  const alertas = derivarAlertas(grafo, snap({}), snap({ turno: 2, aristasBloqueadas: ["C-0001", "C-0002"] }));
  assert.deepEqual(alertas.map((a) => a.titulo), ["Puente colapsado", "Calle bloqueada"]);
  for (const a of alertas) assert.doesNotMatch(a.descripcion, /C-\d{4}/);
  assert.match(alertas[1].descripcion, /cerca de Faro de Manta/);
});

test("a shelter that just filled up raises one alert, only once", () => {
  const lleno = { refugios: [{ id: "R-01", ocupacion: 2, capacidad: 2 }] };
  const [a] = derivarAlertas(grafo, snap({}), snap({ turno: 2, ...lleno }));
  assert.deepEqual([a.tipo, a.titulo, a.refugioId], ["refugio_lleno", "Faro de Manta lleno", "R-01"]);
  assert.deepEqual(derivarAlertas(grafo, snap(lleno), snap({ turno: 3, ...lleno })), []);
});

test("a newly bitten survivor is reported as a person and a place, never as codes", () => {
  const previo = snap({ sobrevivientes: [{ id: "S-0011", nodo: "N-0001", estado: "en_ruta" }] });
  const [a] = derivarAlertas(grafo, previo, snap({ turno: 2, sobrevivientes: [{ id: "S-0011", nodo: "N-0001", estado: "mordido" }] }));
  assert.deepEqual([a.tipo, a.titulo, a.sobrevivienteId], ["mordido", "Sobreviviente 11 mordido", "S-0011"]);
  assert.equal(a.descripcion, "Fue alcanzado cerca de Faro de Manta.");
});

test("several bitten in one turn become a single alert", () => {
  const previo = snap({ sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "en_ruta" as const })) });
  const actual = snap({ turno: 2, sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "mordido" as const })) });
  const alertas = derivarAlertas(grafo, previo, actual);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].titulo, "2 sobrevivientes mordidos");
  assert.equal(alertas[0].descripcion, "Entre ellos, Sobreviviente 1, cerca de Faro de Manta.");
});

test("alert ids are stable, so the same event never raises twice", () => {
  const actual = snap({ turno: 2, aristasBloqueadas: ["C-0002"] });
  assert.equal(derivarAlertas(grafo, snap({}), actual)[0].id, derivarAlertas(grafo, snap({}), actual)[0].id);
});

test("the first snapshot raises nothing: there is no previous turn to compare", () => {
  assert.deepEqual(derivarAlertas(grafo, null, snap({ zombies: [{ id: "Z-1", tipo: "horda", nodo: "N-0002" }] })), []);
});
