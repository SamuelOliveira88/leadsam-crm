// Evolution API helper — server-only.
// Envia mensagens de WhatsApp via instância Evolution configurada em secrets.

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Brasil: se não tiver DDI, prepende 55
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

// Verifica se as notificações automáticas estão pausadas.
export async function notificacoesPausadas(supabaseClient: any): Promise<boolean> {
  try {
    const { data } = await supabaseClient
      .from("notif_pausa")
      .select("pausada_ate")
      .eq("id", 1)
      .maybeSingle();
    if (!data?.pausada_ate) return false;
    return new Date(data.pausada_ate).getTime() > Date.now();
  } catch {
    return false;
  }
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

// === Monitor (período de testes) ===
// Envia uma cópia de cada evento importante para MONITOR_WHATSAPP.
export async function notificarMonitor(
  evento: "entrada" | "entrega",
  lead: { nome: string; telefone?: string | null; email?: string | null; fonte?: string | null; grupo?: string | null },
  corretorNome?: string | null,
): Promise<void> {
  try {
    const numero = process.env.MONITOR_WHATSAPP;
    if (!numero) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await notificacoesPausadas(supabaseAdmin)) return;

    const titulo = evento === "entrada"
      ? "📥 *Lead entrou no sistema*"
      : "✅ *Lead entregue a um corretor*";
    const linhas = [
      titulo,
      `Nome: ${lead.nome}`,
      lead.telefone ? `Telefone: ${lead.telefone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.grupo ? `Grupo: ${lead.grupo}` : null,
      lead.fonte ? `Fonte: ${lead.fonte}` : null,
      evento === "entrega" && corretorNome ? `Corretor: ${corretorNome}` : null,
      evento === "entrega" && !corretorNome ? "Corretor: (represado — fora do horário)" : null,
    ].filter(Boolean);
    await sendWhatsAppText(numero, linhas.join("\n"));
  } catch (e) {
    console.error("[notificarMonitor] falha", e);
  }
}

export async function notificarCorretorPorLead(
  supabaseClient: any,
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: lead, error } = await supabaseClient
    .from("leads")
    .select("id, nome, telefone, email, corretor_id, grupo_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!lead) return { ok: false, error: "Lead não encontrado" };
  if (!lead.corretor_id) return { ok: false, error: "Lead sem corretor" };

  if (await notificacoesPausadas(supabaseClient)) {
    return { ok: false, error: "Notificações pausadas" };
  }

  // Só notifica dentro do horário de atendimento do grupo do lead
  if (lead.grupo_id) {
    const { data: dentro } = await supabaseClient.rpc("dentro_do_horario", { p_grupo_id: lead.grupo_id });
    if (dentro === false) {
      return { ok: false, error: "Fora do horário de atendimento" };
    }
  }


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
    .select("id, lead_id, corretor_id")
    .eq("tipo", "whatsapp")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let enviados = 0;
  const falhas: Array<{ id: string; motivo: string }> = [];
  const leadsProcessados = new Set<string>();

  for (const item of pendentes ?? []) {
    // Duplicatas do mesmo lead nesta rodada: descarta a linha para não travar a fila.
    if (leadsProcessados.has(item.lead_id)) {
      await supabaseClient
        .from("fila_notificacoes")
        .update({ status: "duplicado", enviado_em: new Date().toISOString() })
        .eq("id", item.id);
      continue;
    }
    leadsProcessados.add(item.lead_id);

    const result = await notificarCorretorPorLead(supabaseClient, item.lead_id);
    if (result.ok) {
      enviados++;
    } else {
      falhas.push({ id: item.id, motivo: result.error ?? "Falha ao enviar" });
    }

    // Sempre resolve ESTA linha, mesmo que o corretor do lead tenha mudado —
    // caso contrário a mesma linha volta para sempre e trava a fila.
    await supabaseClient
      .from("fila_notificacoes")
      .update({
        status: result.ok ? "enviado" : "erro",
        enviado_em: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("status", "pendente");
  }

  return { enviados, falhas };
}

