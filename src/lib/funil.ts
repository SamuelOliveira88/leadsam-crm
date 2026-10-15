// Funil do lead — valores fixos, usados no servidor e na tela.

export const ETAPAS_FUNIL = [
  "Novo",
  "Em atendimento",
  "Visita agendada",
  "Proposta",
  "Vendido",
  "Perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export function ehEtapaFunil(v: unknown): v is EtapaFunil {
  return typeof v === "string" && (ETAPAS_FUNIL as readonly string[]).includes(v);
}

/** Cor do cabeçalho de cada coluna do quadro. */
export const COR_ETAPA: Record<EtapaFunil, string> = {
  Novo: "bg-sky-500",
  "Em atendimento": "bg-amber-500",
  "Visita agendada": "bg-violet-500",
  Proposta: "bg-indigo-500",
  Vendido: "bg-emerald-600",
  Perdido: "bg-rose-500",
};

export const MOTIVOS_PERDA_SUGERIDOS = [
  "Sem interesse",
  "Não respondeu",
  "Não aprovou crédito",
  "Comprou outro imóvel",
  "Desistiu da compra",
] as const;

/**
 * Converte o que a pessoa digitou em número.
 * Aceita "250000", "250.000", "250.000,50", "R$ 250.000,00" e "250000.5".
 * Devolve null se não der para entender ou se não for maior que zero.
 */
export function parseValorBR(entrada: string): number | null {
  if (/-/.test(String(entrada ?? ""))) return null;
  let s = String(entrada ?? "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatarReais(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
