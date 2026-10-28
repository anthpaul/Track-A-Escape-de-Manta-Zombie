import type { Calle, Grafo, Nodo, TipoCalle } from "@/features/mapa/domain/tipos";

// Grafo falso y pequeño cerca del centro de Manta, con la misma forma que shared/data/manta.json.
// Se usa hasta que Alex integre la exportación real de OSMnx (T0.3). Las coordenadas son ilustrativas, no calles reales.
const FILAS = 3;
const COLUMNAS = 4;
const PASO = 0.0027; // ~300 m
const ORIGEN = { lat: -0.9645, lng: -80.7135 };

const idNodo = (fila: number, col: number) => `N-${String(fila * COLUMNAS + col + 1).padStart(4, "0")}`;

const nodos: Nodo[] = [];
for (let fila = 0; fila < FILAS; fila++) {
  for (let col = 0; col < COLUMNAS; col++) {
    nodos.push({ id: idNodo(fila, col), lat: ORIGEN.lat - fila * PASO, lng: ORIGEN.lng + col * PASO });
  }
}

const porId = new Map(nodos.map((n) => [n.id, n]));
const coordenadas = (id: string): [number, number] => {
  const nodo = porId.get(id)!;
  return [nodo.lng, nodo.lat];
};

const calles: Calle[] = [];
const agregarCalle = (desde: string, hasta: string, tipo: TipoCalle) => {
  calles.push({
    id: `C-${String(calles.length + 1).padStart(4, "0")}`,
    desde,
    hasta,
    distancia_m: 300,
    tipo,
    // Calle recta: sus dos nodos, nunca [] (docs/CONTRATO_GRAFO.md, T0.2).
    geometria: [coordenadas(desde), coordenadas(hasta)],
  });
};

for (let fila = 0; fila < FILAS; fila++) {
  for (let col = 0; col < COLUMNAS - 1; col++) {
    // La fila del medio es la avenida; uno de sus tramos es un puente.
    const tipo: TipoCalle = fila === 1 ? (col === 1 ? "puente" : "avenida") : "calle";
    agregarCalle(idNodo(fila, col), idNodo(fila, col + 1), tipo);
  }
}
for (let col = 0; col < COLUMNAS; col++) {
  for (let fila = 0; fila < FILAS - 1; fila++) {
    agregarCalle(idNodo(fila, col), idNodo(fila + 1, col), col === COLUMNAS - 1 ? "callejon" : "calle");
  }
}

export const grafoMini: Grafo = {
  version: "mock-mini-1",
  nodos,
  calles,
  refugios: [
    { id: "R-01", nodo: idNodo(0, COLUMNAS - 1), nombre: "Refugio Norte (prueba)", capacidad: 40 },
    { id: "R-02", nodo: idNodo(FILAS - 1, 0), nombre: "Refugio Sur (prueba)", capacidad: 40 },
  ],
};
