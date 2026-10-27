/** Compatibility adapter: all request handling lives in the production factory. */
import { crearRutaPaso } from "./paso";
import type { FuenteMundo } from "../motor/fuente-mundo";
import { ErrorPartidaActiva } from "../db/partida-activa";

export function createRutaPasoParaTests(opts: {
  fuente: FuenteMundo;
  apiKey: string;
  budgetMs: number;
  partidaId: string | null;
}) {
  return crearRutaPaso({
    fuente: opts.fuente,
    apiKey: opts.apiKey,
    budgetMs: opts.budgetMs,
    resolver: {
      async resolverPartidaId() {
        if (opts.partidaId === null) {
          throw new ErrorPartidaActiva("NO_ACTIVE_PARTITION", "No active partition (test)");
        }
        return opts.partidaId;
      },
    },
  });
}
