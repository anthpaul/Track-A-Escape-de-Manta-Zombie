import manta from "@abcstack/shared/data/manta.json";
import type { Grafo } from "@/features/mapa/domain/tipos";

// El grafo real de Manta que exportó Alex con OSMnx (T0.3, docs/CONTRATO_GRAFO.md).
// Los imports de JSON ensanchan las uniones literales (tipo, barrio) a string; la forma la garantiza el
// contrato y la verifica grafo-manta.test.ts, así que el cast es seguro.
export const grafoManta = manta as unknown as Grafo;
