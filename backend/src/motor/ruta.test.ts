import assert from "node:assert/strict";
import { test } from "node:test";
import { crearGrafo, type Grafo } from "@abcstack/shared";
import fixture from "@abcstack/shared/data/fixture-mini.json";
import { buscarRuta, crearContextoGrafo } from "./astar";
import { calcularRutaCompleta } from "./ruta";

const grafo = fixture as Grafo;
const indexado = crearGrafo(fixture);
const contexto = crearContextoGrafo(grafo, indexado);
const nodosRefugio = new Set(grafo.refugios.map((r) => r.nodo));
const MUNDO_LIBRE = { zombies: [], aristasBloqueadas: [] };

function esRutaValida(ruta: string[], bloqueadas: string[] = []): boolean {
  const set = new Set(bloqueadas);
  return ruta.every((n, i) => i === 0 || indexado.esMovimientoValido(ruta[i - 1], n, set));
}

test("the full route starts at the survivor, ends at its shelter and moves street by street", () => {
  const inicio = grafo.nodos.find((n) => !nodosRefugio.has(n.id))!.id;
  const r = calcularRutaCompleta(inicio, contexto, MUNDO_LIBRE);
  assert.equal(r.ruta[0], inicio);
  const fin = r.ruta.at(-1)!;
  assert.ok(nodosRefugio.has(fin), `route must end at a shelter, ended at ${fin}`);
  assert.equal(r.refugio, grafo.refugios.find((ref) => ref.nodo === fin)!.id);
  assert.ok(esRutaValida(r.ruta));
  assert.equal(new Set(r.ruta).size, r.ruta.length, "a route never revisits a node");
});

test("its first step is exactly the one /paso answers for the same world", () => {
  for (const nodo of grafo.nodos.filter((n) => !nodosRefugio.has(n.id))) {
    const paso = buscarRuta(nodo.id, contexto, MUNDO_LIBRE);
    const r = calcularRutaCompleta(nodo.id, contexto, MUNDO_LIBRE);
    if (paso.tipo === "movimiento") assert.equal(r.ruta[1], paso.siguienteNodo, `first step from ${nodo.id}`);
  }
});

test("blocked streets are never part of the route", () => {
  const inicio = grafo.nodos.find((n) => !nodosRefugio.has(n.id))!.id;
  const libre = calcularRutaCompleta(inicio, contexto, MUNDO_LIBRE);
  const primera = indexado.calleEntre(libre.ruta[0], libre.ruta[1])!.id;
  const desviada = calcularRutaCompleta(inicio, contexto, { zombies: [], aristasBloqueadas: [primera] });
  assert.ok(esRutaValida(desviada.ruta, [primera]));
});

test("a survivor already at a shelter has a one-node route", () => {
  const refugio = grafo.refugios[0];
  assert.deepEqual(calcularRutaCompleta(refugio.nodo, contexto, MUNDO_LIBRE), { refugio: refugio.id, ruta: [refugio.nodo] });
});

test("with every exit blocked the route is just the current node and says why", () => {
  // N-0003 only connects through C-0002 and C-0003 in the fixture.
  assert.deepEqual(calcularRutaCompleta("N-0003", contexto, { zombies: [], aristasBloqueadas: ["C-0002", "C-0003"] }), {
    refugio: null,
    ruta: ["N-0003"],
    motivo: "sin_ruta",
  });
});
