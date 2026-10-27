import manta from "@abcstack/shared/data/manta.json";
import type { Grafo } from "@/features/mapa/domain/tipos";

// The real Manta graph exported by Alex with OSMnx (T0.3, docs/CONTRATO_GRAFO.md).
// JSON imports widen literal unions (tipo, barrio) to string; the shape is guaranteed by the
// contract and checked by grafo-manta.test.ts, so the cast is safe.
export const grafoManta = manta as unknown as Grafo;
