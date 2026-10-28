import type { EstadoSobreviviente, Grafo, Nodo } from "./tipos";

// Convierte los códigos del contrato (S-0005, N-0165) en palabras que un visitante entiende. Los ids se mantienen en los
// datos y en las etiquetas accesibles; solo cambia lo que se lee en pantalla.

const BARRIOS: Record<NonNullable<Nodo["barrio"]>, string> = {
  tarqui: "Tarqui",
  los_esteros: "Los Esteros",
  barbasquillo: "Barbasquillo",
  jocay: "Jocay",
};

export function nombreSobreviviente(id: string): string {
  const numero = /^S-(\d+)$/.exec(id)?.[1];
  return numero ? `Sobreviviente ${Number(numero)}` : id;
}

// Etiqueta de la persona seguida en el mapa: alguien mordido o a salvo nunca debe leerse como si siguiera en camino.
export function etiquetaPersona(id: string, estado: EstadoSobreviviente): string {
  const nombre = nombreSobreviviente(id);
  return estado === "mordido" ? `${nombre} · mordido` : estado === "a_salvo" ? `${nombre} · a salvo` : nombre;
}

export function refugioMasCercano(grafo: Grafo, nodo: Nodo | undefined) {
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

// "en Los Esteros" dentro de los cuatro barrios de inicio del reto; en otro caso, cerca de un refugio.
export function lugarDeNodo(grafo: Grafo, nodoId: string): string {
  const nodo = grafo.nodos.find((n) => n.id === nodoId);
  if (!nodo) return "en un punto desconocido";
  if (nodo.barrio) return `en ${BARRIOS[nodo.barrio]}`;
  const refugio = refugioMasCercano(grafo, nodo);
  return refugio ? `cerca de ${refugio.nombre}` : "en un punto desconocido";
}
