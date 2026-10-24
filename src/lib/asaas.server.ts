// Fala com o Asaas. A chave (ASAAS_API_KEY) fica só no servidor (Vercel). Nada de chave no código.
export type PlanoPago = "alexandria" | "alexandria_ia";

export const PLANOS: Record<PlanoPago, { nome: string; valor: number; descricao: string }> = {
  alexandria: { nome: "Alexandria Leads — plano mensal", valor: 299, descricao: "Alexandria Leads para a imobiliária, com até 10 corretores. Cobrança mensal." },
  alexandria_ia: { nome: "Alexandria Leads + Mi.IA — plano mensal", valor: 499, descricao: "Alexandria Leads com até 10 corretores e a Mi.IA atendendo os leads antes do corretor. Cobrança mensal." },
};

const base = () => (process.env.ASAAS_API_URL || "https://api.asaas.com/v3").replace(/\/$/, "");

export async function criarLinkPagamento(empresaId: string, plano: PlanoPago): Promise<{ url: string; id: string }> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("Pagamento ainda não configurado (falta a chave do Asaas no servidor).");
  const p = PLANOS[plano];
  const corpo: Record<string, unknown> = {
    name: p.nome,
    description: p.descricao,
    billingType: "UNDEFINED", // o cliente escolhe Pix, boleto ou cartão
    value: p.valor,
    dueDateLimitDays: 3,
    externalReference: `alex|${empresaId}|${plano}`,
    notificationEnabled: true,
    callback: { successUrl: "https://www.alexandrialeads.app/meu-plano?pago=1", autoRedirect: true },
  };
  corpo.chargeType = "RECURRENT";
  corpo.subscriptionCycle = "MONTHLY";

  const r = await fetch(`${base()}/paymentLinks`, {
    method: "POST",
    headers: { "content-type": "application/json", access_token: key, "user-agent": "AlexandriaLeads/1.0" },
    body: JSON.stringify(corpo),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.url) {
    console.error("[asaas] erro ao criar link", r.status, JSON.stringify(j).slice(0, 300));
    throw new Error("Não consegui criar o pagamento agora. Tente de novo em instantes.");
  }
  return { url: String(j.url), id: String(j.id) };
}
