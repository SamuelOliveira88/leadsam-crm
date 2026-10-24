// Fala com o Asaas. A chave (ASAAS_API_KEY) fica só no servidor (Vercel). Nada de chave no código.
export type PlanoPago = "pago" | "pago_ia";

export const PLANOS: Record<PlanoPago, { nome: string; valor: number; descricao: string }> = {
  pago: { nome: "Alexandria Leads — Plano Pago (1 ano)", valor: 199.9, descricao: "Funil, planilha, lembretes, agendamento, disparo e equipe. 12 meses." },
  pago_ia: { nome: "Alexandria Leads — Pago com a Mi.IA (mensal)", valor: 49.9, descricao: "Tudo do plano Pago, mais a Mi.IA atendendo no WhatsApp. Cobrança mensal." },
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
  if (plano === "pago") { corpo.chargeType = "INSTALLMENT"; corpo.maxInstallmentCount = 6; }
  else { corpo.chargeType = "RECURRENT"; corpo.subscriptionCycle = "MONTHLY"; }

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
