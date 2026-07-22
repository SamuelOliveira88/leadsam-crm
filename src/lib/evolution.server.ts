// Evolution API helper — server-only.
// Envia mensagens de WhatsApp via instância Evolution configurada em secrets.

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Brasil: se não tiver DDI, prepende 55
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export async function sendWhatsAppText(numero: string, mensagem: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instance) return { ok: false, error: "Evolution não configurada" };

  const phone = normalizePhone(numero);
  if (!phone) return { ok: false, error: "Telefone inválido" };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: phone, text: mensagem }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `Evolution ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "erro desconhecido" };
  }
}

export function mensagemNovoLead(lead: { nome: string; telefone?: string | null; email?: string | null }) {
  const linhas = [
    "🔔 *Novo lead recebido — Alexandria Leds*",
    `Nome: ${lead.nome}`,
    lead.telefone ? `Telefone: ${lead.telefone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    "",
    "Atenda em até 10 minutos para não perder a preferência.",
  ].filter(Boolean);
  return linhas.join("\n");
}
