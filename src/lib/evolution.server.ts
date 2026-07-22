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

export async function notificarCorretorPorLead(
  supabaseClient: any,
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: lead, error } = await supabaseClient
    .from("leads")
    .select("id, nome, telefone, email, corretor_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!lead) return { ok: false, error: "Lead não encontrado" };
  if (!lead.corretor_id) return { ok: false, error: "Lead sem corretor" };

  const { data: corretor, error: corretorError } = await supabaseClient
    .from("corretores")
    .select("id, nome, telefone")
    .eq("id", lead.corretor_id)
    .maybeSingle();

  if (corretorError) return { ok: false, error: corretorError.message };
  if (!corretor?.telefone) return { ok: false, error: "Corretor sem telefone cadastrado" };

  const result = await sendWhatsAppText(corretor.telefone, mensagemNovoLead(lead));
  if (!result.ok) return result;

  await supabaseClient
    .from("fila_notificacoes")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("lead_id", lead.id)
    .eq("corretor_id", corretor.id)
    .eq("tipo", "whatsapp")
    .eq("status", "pendente");

  return { ok: true };
}

export async function processarNotificacoesWhatsAppPendentes(
  supabaseClient: any,
  limit = 20,
): Promise<{ enviados: number; falhas: Array<{ id: string; motivo: string }> }> {
  const { data: pendentes, error } = await supabaseClient
    .from("fila_notificacoes")
    .select("id, lead_id")
    .eq("tipo", "whatsapp")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let enviados = 0;
  const falhas: Array<{ id: string; motivo: string }> = [];
  const leadsProcessados = new Set<string>();

  for (const item of pendentes ?? []) {
    if (leadsProcessados.has(item.lead_id)) continue;
    leadsProcessados.add(item.lead_id);

    const result = await notificarCorretorPorLead(supabaseClient, item.lead_id);
    if (result.ok) {
      enviados++;
    } else {
      falhas.push({ id: item.id, motivo: result.error ?? "Falha ao enviar" });
    }
  }

  return { enviados, falhas };
}
