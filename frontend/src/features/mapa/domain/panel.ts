import type { EstadoSobreviviente } from "./tipos";

// Panel state (tabs, selection, search, layers, alerts toast) as a pure reducer: React only holds it
// with useReducer, so every interaction rule is tested here without a browser.

export type Tab = "ref" | "surv" | "layers" | "alert";
export type CapaClave = "caminante" | "corredor" | "horda" | "sobreviviente" | "mordido" | "refugio";
export type FiltroSobreviviente = "todos" | EstadoSobreviviente;

export type EstadoPanel = {
  tab: Tab;
  refugioId: string | null;
  sobrevivienteId: string | null;
  busqueda: string;
  filtro: FiltroSobreviviente;
  capas: Record<CapaClave, boolean>;
  mostrarRuta: boolean;
  alertasLeidas: ReadonlySet<string>;
  toastAlertaId: string | null; // alert shown in the toast; null when closed
};

export type AccionPanel =
  | { tipo: "cambiarTab"; tab: Tab }
  | { tipo: "seleccionarRefugio"; id: string }
  | { tipo: "seleccionarSobreviviente"; id: string }
  | { tipo: "verEnCamino"; nombreRefugio: string }
  | { tipo: "buscar"; texto: string }
  | { tipo: "filtrar"; filtro: FiltroSobreviviente }
  | { tipo: "alternarCapa"; capa: CapaClave }
  | { tipo: "alternarRuta" }
  | { tipo: "marcarLeida"; id: string }
  | { tipo: "ubicarAlerta"; alerta: { id: string; refugioId?: string; sobrevivienteId?: string } }
  | { tipo: "nuevaAlerta"; id: string }
  | { tipo: "cerrarToast" }
  | { tipo: "abrirAlertas" };

export function estadoInicialPanel(): EstadoPanel {
  return {
    tab: "ref",
    refugioId: null,
    sobrevivienteId: null,
    busqueda: "",
    filtro: "todos",
    capas: { caminante: true, corredor: true, horda: true, sobreviviente: true, mordido: true, refugio: true },
    // The planned route starts visible: the challenge requires it on the live map (plan A9).
    mostrarRuta: true,
    alertasLeidas: new Set(),
    toastAlertaId: null,
  };
}

const leer = (leidas: ReadonlySet<string>, id: string) => new Set([...leidas, id]);

export function reducirPanel(estado: EstadoPanel, accion: AccionPanel): EstadoPanel {
  switch (accion.tipo) {
    case "cambiarTab":
      return { ...estado, tab: accion.tab };
    case "seleccionarRefugio":
      return { ...estado, tab: "ref", refugioId: accion.id, sobrevivienteId: null };
    case "seleccionarSobreviviente":
      return { ...estado, tab: "surv", sobrevivienteId: accion.id };
    case "verEnCamino":
      return { ...estado, tab: "surv", busqueda: accion.nombreRefugio, filtro: "en_ruta" };
    case "buscar":
      return { ...estado, busqueda: accion.texto };
    case "filtrar":
      return { ...estado, filtro: accion.filtro };
    case "alternarCapa":
      return { ...estado, capas: { ...estado.capas, [accion.capa]: !estado.capas[accion.capa] } };
    case "alternarRuta":
      return { ...estado, mostrarRuta: !estado.mostrarRuta };
    case "marcarLeida":
      return { ...estado, alertasLeidas: leer(estado.alertasLeidas, accion.id) };
    case "ubicarAlerta": {
      const { id, refugioId, sobrevivienteId } = accion.alerta;
      const leida = { ...estado, alertasLeidas: leer(estado.alertasLeidas, id) };
      if (refugioId) return reducirPanel(leida, { tipo: "seleccionarRefugio", id: refugioId });
      if (sobrevivienteId) return reducirPanel(leida, { tipo: "seleccionarSobreviviente", id: sobrevivienteId });
      return leida;
    }
    case "nuevaAlerta":
      return { ...estado, toastAlertaId: accion.id };
    case "cerrarToast":
      return { ...estado, toastAlertaId: null };
    case "abrirAlertas":
      return { ...estado, tab: "alert", toastAlertaId: null };
  }
}
