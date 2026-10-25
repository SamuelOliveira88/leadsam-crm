// Fala com o Asaas. A chave (ASAAS_API_KEY) fica só no servidor (Vercel). Nada de chave no código.
export type PlanoPago = "alexandria" | "alexandria_ia";

export const PLANOS: Record<PlanoPago, { nome: string; valor: number; descricao: string }> = {
  alexandria: { nome: "Alexandria Leads — plano mensal", valor: 299, descricao: "Alexandria Leads para a imobiliária, com até 10 corretores. Cobrança mensal." },
  alexandria_ia: { nome: "Alexandria Leads + Mi.IA — plano mensal", valor: 499, descricao: "Alexandria Leads com até 10 corretores e a Mi.IA atendendo os leads antes do corretor. Cobrança mensal." },
};

// Corretor ativo além dos 10 incluídos (preço por corretor, por mês).
export const PRECO_EXTRA: Record<PlanoPago, number> = { alexandria: 30, alexandria_ia: 50 };

const base = () => (process.env.ASAAS_API_URL || "https://api.asaas.com/v3").replace(/\/$/, "");

export async function criarLinkPagamento(empresaId: string, plano: PlanoPago, extras = 0): Promise<{ url: string; id: string }> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("Pagamento ainda não configurado (falta a chave do Asaas no servidor).");
  const p = extras > 0
    ? { nome: `Alexandria Leads — ${extras} corretor(es) extra(s)`, valor: extras * PRECO_EXTRA[plano], descricao: `${extras} corretor(es) ativo(s) além dos 10 incluídos no plano. Cobrança mensal.` }
    : PLANOS[plano];
  const corpo: Record<string, unknown> = {
    name: p.nome,
    description: p.descricao,
    billingType: "UNDEFINED", // o cliente escolhe Pix, boleto ou cartão
    value: p.valor,
    dueDateLimitDays: 3,
    externalReference: extras > 0 ? `alex|${empresaId}|extra${extras}` : `alex|${empresaId}|${plano}`,
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
