import { nodosBloqueadosPorHordas, refugiosSinAcceso } from "./grafo";
import { lugarDeNodo, nombreSobreviviente, refugioMasCercano } from "./lugares";
import type { Grafo, Snapshot } from "./tipos";

// Alerts are not part of GET /api/estado: they are derived in the front by comparing a turn with
// the previous one. Ids are built from the event, so the same event never raises two alerts.

export type TipoAlerta = "horda" | "calle_bloqueada" | "refugio_lleno" | "mordido" | "llegada";

export type Alerta = {
  id: string;
  turno: number;
  tipo: TipoAlerta;
  titulo: string;
  descripcion: string;
  refugioId?: string;
  sobrevivienteId?: string;
  cantidad?: number; // people covered by a bite or arrival alert
};

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

// The most repeated value: "most of the bitten were near X".
function masFrecuente(valores: string[]): string {
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  return [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
}

export function derivarAlertas(grafo: Grafo, previo: Snapshot | null, actual: Snapshot): Alerta[] {
  if (!previo) return [];
  const { turno } = actual;
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const alertas: Alerta[] = [];

  // Shelters that became unreachable this turn, named in the horde alert that caused it.
  const cortadosAntes = refugiosSinAcceso(grafo, previo);
  const recienCortados = [...refugiosSinAcceso(grafo, actual)].filter((id) => !cortadosAntes.has(id));
  const nombreRefugio = (id: string) => grafo.refugios.find((r) => r.id === id)?.nombre ?? id;

  const hordasPrevias = new Set(previo.zombies.filter((z) => z.tipo === "horda").map((z) => z.id));
  for (const z of actual.zombies) {
    if (z.tipo !== "horda" || hordasPrevias.has(z.id)) continue;
    const zona = nodosBloqueadosPorHordas(grafo, [z]);
    const cerca = refugioMasCercano(grafo, nodos.get(z.nodo));
    const cortados = recienCortados.filter((id) => !refugiosSinAcceso(grafo, { ...actual, zombies: actual.zombies.filter((x) => x.id !== z.id) }).has(id));
    alertas.push({
      id: `${turno}:horda:${z.id}`,
      turno,
      tipo: "horda",
      titulo: `Nueva horda ${lugarDeNodo(grafo, z.nodo)}`,
      descripcion:
        cortados.length > 0
          ? `${cortados.map(nombreRefugio).join(" y ")} ${cortados.length === 1 ? "quedó" : "quedaron"} sin acceso`
          : `Bloquea ${zona.size} ${zona.size === 1 ? "cruce" : "cruces"}`,
      refugioId: cortados[0] ?? cerca?.id,
    });
  }

  // Survivors whose route changed this turn: another shelter, or a route that got longer even after
  // the step they just took (standing still keeps it equal, so it is not counted). Needs the optional
  // refugio / callesRestantes fields; without them nobody is counted.
  const antes = new Map(previo.sobrevivientes.map((s) => [s.id, s]));
  const desviados = actual.sobrevivientes.filter((s) => {
    const p = antes.get(s.id);
    if (!p || s.estado !== "en_ruta" || p.estado !== "en_ruta") return false;
    if (p.refugio && s.refugio && p.refugio !== s.refugio) return true;
    return p.callesRestantes !== undefined && s.callesRestantes !== undefined && s.callesRestantes > p.callesRestantes;
  }).length;

  const bloqueadasPrevias = new Set(previo.aristasBloqueadas);
  for (const id of actual.aristasBloqueadas) {
    if (bloqueadasPrevias.has(id)) continue;
    const calle = grafo.calles.find((c) => c.id === id);
    const cerca = refugioMasCercano(grafo, calle && nodos.get(calle.desde));
    const lugar = calle ? ` ${lugarDeNodo(grafo, calle.desde)}` : "";
    alertas.push({
      id: `${turno}:calle:${id}`,
      turno,
      tipo: "calle_bloqueada",
      titulo: calle?.tipo === "puente" ? `Se cayó un puente${lugar}` : `Se cerró una calle${lugar}`,
      descripcion:
        desviados === 0
          ? "Las rutas se recalculan"
          : desviados === 1
            ? "1 sobreviviente cambió de camino"
            : `${desviados} sobrevivientes cambiaron de camino`,
      refugioId: cerca?.id,
    });
  }

  const llenosPrevios = new Set(previo.refugios.filter((r) => r.ocupacion >= r.capacidad).map((r) => r.id));
  for (const r of actual.refugios) {
    if (r.ocupacion < r.capacidad || llenosPrevios.has(r.id)) continue;
    const nombre = grafo.refugios.find((x) => x.id === r.id)?.nombre ?? r.id;
    alertas.push({
      id: `${turno}:lleno:${r.id}`,
      turno,
      tipo: "refugio_lleno",
      titulo: `${nombre} lleno`,
      descripcion: "Los sobrevivientes en camino deben redirigirse a otro refugio.",
      refugioId: r.id,
    });
  }

  const mordidosPrevios = new Set(previo.sobrevivientes.filter((s) => s.estado === "mordido").map((s) => s.id));
  const nuevos = actual.sobrevivientes.filter((s) => s.estado === "mordido" && !mordidosPrevios.has(s.id));
  if (nuevos.length > 0) {
    const [primero] = nuevos;
    alertas.push({
      id: `${turno}:mordido:${primero.id}`,
      turno,
      tipo: "mordido",
      titulo: nuevos.length === 1 ? `${nombreSobreviviente(primero.id)} mordido` : `${nuevos.length} sobrevivientes mordidos`,
      descripcion:
        nuevos.length === 1
          ? mayuscula(lugarDeNodo(grafo, primero.nodo))
          : `La mayoría ${masFrecuente(nuevos.map((s) => lugarDeNodo(grafo, s.nodo)))}`,
      sobrevivienteId: primero.id,
      cantidad: nuevos.length,
    });
  }

  // Arrivals, one alert per shelter. Good news: they never pop up the toast (see esUrgente).
  const aSalvoAntes = new Set(previo.sobrevivientes.filter((s) => s.estado === "a_salvo").map((s) => s.id));
  const llegadas = new Map<string, number>();
  for (const s of actual.sobrevivientes) {
    if (s.estado !== "a_salvo" || aSalvoAntes.has(s.id)) continue;
    const refugio = s.refugio ?? grafo.refugios.find((r) => r.nodo === s.nodo)?.id;
    if (refugio) llegadas.set(refugio, (llegadas.get(refugio) ?? 0) + 1);
  }
  for (const [refugioId, n] of llegadas) {
    const ocupacion = actual.refugios.find((r) => r.id === refugioId)?.ocupacion;
    alertas.push({
      id: `${turno}:llegada:${refugioId}`,
      turno,
      tipo: "llegada",
      titulo: `${n} ${n === 1 ? "llegó" : "llegaron"} a ${nombreRefugio(refugioId)}`,
      descripcion: ocupacion === undefined ? "Ya están a salvo" : `Ya son ${ocupacion} a salvo`,
      refugioId,
      cantidad: n,
    });
  }

  return alertas;
}

// Bad news interrupts (toast, unread badge); arrivals happen almost every turn and only get listed.
export const esUrgente = (a: Alerta) => a.tipo !== "llegada";

export type TonoResumen = "mordido" | "peligro" | "aviso" | "llegada";
export type ChipResumen = { texto: string; tono: TonoResumen };

// One line for the turn bar over the map: "7 mordidos · 1 horda nueva · 2 llegaron".
export function resumenTurno(alertas: Alerta[], turno: number): ChipResumen[] {
  const delTurno = alertas.filter((a) => a.turno === turno);
  const contar = (tipo: TipoAlerta) => delTurno.filter((a) => a.tipo === tipo).length;
  const personas = (tipo: TipoAlerta) => delTurno.filter((a) => a.tipo === tipo).reduce((t, a) => t + (a.cantidad ?? 1), 0);
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  const chips: (ChipResumen | null)[] = [
    personas("mordido") ? { texto: plural(personas("mordido"), "mordido", "mordidos"), tono: "mordido" } : null,
    contar("horda") ? { texto: plural(contar("horda"), "horda nueva", "hordas nuevas"), tono: "peligro" } : null,
    contar("calle_bloqueada")
      ? { texto: plural(contar("calle_bloqueada"), "calle cerrada", "calles cerradas"), tono: "peligro" }
      : null,
    contar("refugio_lleno") ? { texto: plural(contar("refugio_lleno"), "refugio lleno", "refugios llenos"), tono: "aviso" } : null,
    personas("llegada") ? { texto: plural(personas("llegada"), "llegó", "llegaron"), tono: "llegada" } : null,
  ];
  return chips.filter((c): c is ChipResumen => c !== null);
}

// The alert list: arrivals only for the current turn (older ones are already in each shelter's
// count), so past turns show only what went wrong and arrival-only turns drop out.
export const alertasVisibles = (alertas: Alerta[], turnoActual: number) =>
  alertas.filter((a) => esUrgente(a) || a.turno === turnoActual);
