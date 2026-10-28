import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasVisibles, derivarAlertas, resumenTurno } from "./alertas";
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

test("a new horde says where it is and which shelter it cut off", () => {
  const enRuta = [{ id: "S-0001", nodo: "N-0001", estado: "en_ruta" as const }];
  const [a] = derivarAlertas(
    grafo,
    snap({ sobrevivientes: enRuta }),
    snap({ turno: 2, sobrevivientes: enRuta, zombies: [{ id: "Z-1", tipo: "horda", nodo: "N-0002" }] }),
  );
  assert.equal(a.tipo, "horda");
  assert.equal(a.titulo, "Nueva horda cerca de Faro de Manta");
  assert.equal(a.descripcion, "Faro de Manta quedó sin acceso");
  assert.equal(a.refugioId, "R-01");
});

test("a horde that cuts nothing off says how many crossings it blocks", () => {
  const [a] = derivarAlertas(grafo, snap({}), snap({ turno: 2, zombies: [{ id: "Z-1", tipo: "horda", nodo: "N-0001" }] }));
  assert.equal(a.descripcion, "Bloquea 2 cruces");
});

test("a fallen bridge and a closed street are told apart, with a place and without street codes", () => {
  const alertas = derivarAlertas(grafo, snap({}), snap({ turno: 2, aristasBloqueadas: ["C-0001", "C-0002"] }));
  assert.deepEqual(alertas.map((a) => a.titulo), ["Se cayó un puente cerca de Faro de Manta", "Se cerró una calle cerca de Faro de Manta"]);
  for (const a of alertas) assert.doesNotMatch(a.titulo + a.descripcion, /C-\d{4}/);
  assert.equal(alertas[0].descripcion, "Las rutas se recalculan");
});

test("a closed street counts the survivors whose route got longer or changed shelter", () => {
  const previo = snap({
    sobrevivientes: [
      { id: "S-0001", nodo: "N-0001", estado: "en_ruta", refugio: "R-01", callesRestantes: 2 },
      { id: "S-0002", nodo: "N-0001", estado: "en_ruta", refugio: "R-01", callesRestantes: 2 },
      { id: "S-0003", nodo: "N-0001", estado: "en_ruta", refugio: "R-01", callesRestantes: 2 },
    ],
  });
  const actual = snap({
    turno: 2,
    aristasBloqueadas: ["C-0002"],
    sobrevivientes: [
      { id: "S-0001", nodo: "N-0002", estado: "en_ruta", refugio: "R-01", callesRestantes: 4 }, // desvío
      { id: "S-0002", nodo: "N-0001", estado: "en_ruta", refugio: "R-02", callesRestantes: 1 }, // otro refugio
      { id: "S-0003", nodo: "N-0002", estado: "en_ruta", refugio: "R-01", callesRestantes: 1 }, // misma ruta
    ],
  });
  assert.equal(derivarAlertas(grafo, previo, actual)[0].descripcion, "2 sobrevivientes cambiaron de camino");
});

test("survivors who reach a shelter are grouped per shelter with its new total", () => {
  const previo = snap({ sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0002", estado: "en_ruta" as const })) });
  const actual = snap({
    turno: 2,
    sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0003", estado: "a_salvo" as const, refugio: "R-01" })),
    refugios: [{ id: "R-01", ocupacion: 2, capacidad: 9 }],
  });
  const [a] = derivarAlertas(grafo, previo, actual);
  assert.deepEqual([a.tipo, a.titulo, a.descripcion, a.refugioId], ["llegada", "2 llegaron a Faro de Manta", "Ya son 2 a salvo", "R-01"]);
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
  assert.equal(a.descripcion, "Cerca de Faro de Manta");
});

test("several bitten in one turn become a single alert", () => {
  const previo = snap({ sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "en_ruta" as const })) });
  const actual = snap({ turno: 2, sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "mordido" as const })) });
  const alertas = derivarAlertas(grafo, previo, actual);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].titulo, "2 sobrevivientes mordidos");
  assert.equal(alertas[0].descripcion, "La mayoría cerca de Faro de Manta");
});

test("alert ids are stable, so the same event never raises twice", () => {
  const actual = snap({ turno: 2, aristasBloqueadas: ["C-0002"] });
  assert.equal(derivarAlertas(grafo, snap({}), actual)[0].id, derivarAlertas(grafo, snap({}), actual)[0].id);
});

test("the first snapshot raises nothing: there is no previous turn to compare", () => {
  assert.deepEqual(derivarAlertas(grafo, null, snap({ zombies: [{ id: "Z-1", tipo: "horda", nodo: "N-0002" }] })), []);
});

test("the turn bar sums each kind of event in plain words, bad news first", () => {
  const alertas = [
    { id: "a", turno: 23, tipo: "llegada", titulo: "", descripcion: "", cantidad: 2 },
    { id: "b", turno: 23, tipo: "mordido", titulo: "", descripcion: "", cantidad: 7 },
    { id: "c", turno: 23, tipo: "horda", titulo: "", descripcion: "" },
    { id: "d", turno: 22, tipo: "mordido", titulo: "", descripcion: "", cantidad: 4 },
  ] as const;
  assert.deepEqual(resumenTurno([...alertas], 23), [
    { texto: "7 mordidos", tono: "mordido", tipo: "mordido" },
    { texto: "1 horda nueva", tono: "peligro", tipo: "horda" },
    { texto: "2 llegaron", tono: "llegada", tipo: "llegada" },
  ]);
  assert.deepEqual(resumenTurno([...alertas], 22), [{ texto: "4 mordidos", tono: "mordido", tipo: "mordido" }]);
});

test("bites and arrivals carry how many people they cover", () => {
  const previo = snap({ sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "en_ruta" as const })) });
  const actual = snap({ turno: 2, sobrevivientes: ["S-0001", "S-0002"].map((id) => ({ id, nodo: "N-0001", estado: "mordido" as const })) });
  assert.equal(derivarAlertas(grafo, previo, actual)[0].cantidad, 2);
});

test("the alert list keeps arrivals only for the current turn, so bad news is not buried", () => {
  const a = (id: string, turno: number, tipo: "llegada" | "mordido") => ({ id, turno, tipo, titulo: "", descripcion: "" });
  const lista = [a("1", 19, "llegada"), a("2", 18, "llegada"), a("3", 18, "mordido"), a("4", 17, "llegada")];
  assert.deepEqual(alertasVisibles(lista, 19).map((x) => x.id), ["1", "3"]);
});
