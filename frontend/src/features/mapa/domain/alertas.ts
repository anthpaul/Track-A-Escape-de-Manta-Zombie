import { nodosBloqueadosPorHordas } from "./grafo";
import type { Grafo, Nodo, Snapshot } from "./tipos";

// Alerts are not part of GET /api/estado: they are derived in the front by comparing a turn with
// the previous one. Ids are built from the event, so the same event never raises two alerts.

export type TipoAlerta = "horda" | "calle_bloqueada" | "refugio_lleno" | "mordido";

export type Alerta = {
  id: string;
  turno: number;
  tipo: TipoAlerta;
  titulo: string;
  descripcion: string;
  refugioId?: string;
  sobrevivienteId?: string;
};

function refugioMasCercano(grafo: Grafo, nodo: Nodo | undefined) {
  if (!nodo) return undefined;
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  let mejor: { id: string; nombre: string; d: number } | undefined;
  for (const r of grafo.refugios) {
    const n = nodos.get(r.nodo);
    if (!n) continue;
    const d = (n.lat - nodo.lat) ** 2 + (n.lng - nodo.lng) ** 2;
    if (!mejor || d < mejor.d) mejor = { id: r.id, nombre: r.nombre, d };
  }
  return mejor;
}

export function derivarAlertas(grafo: Grafo, previo: Snapshot | null, actual: Snapshot): Alerta[] {
  if (!previo) return [];
  const { turno } = actual;
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]));
  const alertas: Alerta[] = [];

  const hordasPrevias = new Set(previo.zombies.filter((z) => z.tipo === "horda").map((z) => z.id));
  for (const z of actual.zombies) {
    if (z.tipo !== "horda" || hordasPrevias.has(z.id)) continue;
    const cruces = nodosBloqueadosPorHordas(grafo, [z]).size;
    const cerca = refugioMasCercano(grafo, nodos.get(z.nodo));
    alertas.push({
      id: `${turno}:horda:${z.id}`,
      turno,
      tipo: "horda",
      titulo: "Horda detectada",
      descripcion: `${cruces} cruces bloqueados${cerca ? ` cerca de ${cerca.nombre}` : ""}.`,
      refugioId: cerca?.id,
    });
  }

  const bloqueadasPrevias = new Set(previo.aristasBloqueadas);
  for (const id of actual.aristasBloqueadas) {
    if (bloqueadasPrevias.has(id)) continue;
    const calle = grafo.calles.find((c) => c.id === id);
    const cerca = refugioMasCercano(grafo, calle && nodos.get(calle.desde));
    alertas.push({
      id: `${turno}:calle:${id}`,
      turno,
      tipo: "calle_bloqueada",
      titulo: calle?.tipo === "puente" ? "Puente colapsado" : "Calle bloqueada",
      descripcion: `${id} ya no se puede cruzar${cerca ? ` (zona de ${cerca.nombre})` : ""}. Las rutas se recalculan.`,
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
      titulo: nuevos.length === 1 ? `${primero.id} mordido` : `${nuevos.length} sobrevivientes mordidos`,
      descripcion: nuevos.length === 1 ? `Nodo ${primero.nodo}.` : `Entre ellos ${primero.id} en el nodo ${primero.nodo}.`,
      sobrevivienteId: primero.id,
    });
  }

  return alertas;
}
