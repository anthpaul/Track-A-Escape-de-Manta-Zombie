import type { Grafo, Snapshot } from "@/features/mapa/domain/tipos";

// Pure view-model for the stats panel, derived only from the snapshot (no front-end state).

export type NivelLatencia = "excelente" | "bueno" | "limite" | "fuera" | "sin_datos";

// Official p95 scoring for POST /paso: ≤150 ms → 10, ≤300 → 7, ≤500 → 4, more → 0.
export function nivelLatencia(p95ms: number | null): { nivel: NivelLatencia; puntos: number | null } {
  if (p95ms === null) return { nivel: "sin_datos", puntos: null };
  if (p95ms <= 150) return { nivel: "excelente", puntos: 10 };
  if (p95ms <= 300) return { nivel: "bueno", puntos: 7 };
  if (p95ms <= 500) return { nivel: "limite", puntos: 4 };
  return { nivel: "fuera", puntos: 0 };
}

export type RefugioPanel = { id: string; nombre: string; ocupacion: number; capacidad: number; lleno: boolean };

export type ResumenPanel = {
  ronda: Snapshot["ronda"];
  turno: number;
  enRuta: number;
  aSalvo: number;
  mordidos: number;
  total: number;
  supervivenciaPct: number;
  p95ms: number | null;
  latencia: ReturnType<typeof nivelLatencia>;
  callesBloqueadas: number;
  refugios: RefugioPanel[];
};

export function resumenPanel(grafo: Grafo, snapshot: Snapshot): ResumenPanel {
  const { vivos, aSalvo, mordidos, p95ms } = snapshot.metricas;
  const total = vivos + aSalvo + mordidos;
  const nombres = new Map(grafo.refugios.map((r) => [r.id, r.nombre]));

  return {
    ronda: snapshot.ronda,
    turno: snapshot.turno,
    enRuta: vivos,
    aSalvo,
    mordidos,
    total,
    // Floor, so 100% only shows when nobody was bitten. Multiply first: (57 / 100) * 100 is 56.999…
    supervivenciaPct: total === 0 ? 100 : Math.floor(((total - mordidos) * 100) / total),
    p95ms,
    latencia: nivelLatencia(p95ms),
    callesBloqueadas: snapshot.aristasBloqueadas.length,
    refugios: snapshot.refugios.map((r) => ({
      id: r.id,
      nombre: nombres.get(r.id) ?? r.id,
      ocupacion: r.ocupacion,
      capacidad: r.capacidad,
      lleno: r.ocupacion >= r.capacidad,
    })),
  };
}
