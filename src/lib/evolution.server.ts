// Evolution API helper — server-only.
import { decidirAposFalha, type MotivoFalha } from "@/lib/fila-notificacao";
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


export async function sendWhatsAppText(
  numero: string,
  mensagem: string,
  instanceName?: string,
): Promise<{ ok: boolean; error?: string; permanente?: boolean }> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = instanceName || process.env.EVOLUTION_INSTANCE;
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
      // 400 com "exists":false = o número não tem WhatsApp. Repetir não adianta.
      const permanente = res.status === 400 && /"exists"\s*:\s*false/.test(txt);
      return { ok: false, error: `Evolution ${res.status}: ${txt.slice(0, 200)}`, permanente };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "erro desconhecido" };
  }
}

// Notificações do Alexandria devem sair pelo número 5511932368278 (instância sara-vendedora).
export async function sendWhatsAppNotification(
  numero: string,
  mensagem: string,
): Promise<{ ok: boolean; error?: string; permanente?: boolean }> {
  return sendWhatsAppText(numero, mensagem, process.env.EVOLUTION_INSTANCE_NOTIF);
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
    // Regra: o monitor só recebe aviso quando o lead é EFETIVAMENTE entregue
    // a um corretor. Entrada no sistema e leads represados não notificam.
    if (evento !== "entrega") return;
    if (!corretorNome) return;

    const numero = process.env.MONITOR_WHATSAPP;
    if (!numero) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await notificacoesPausadas(supabaseAdmin)) return;

    const linhas = [
      "✅ *Lead entregue a um corretor*",
      `Nome: ${lead.nome}`,
      lead.telefone ? `Telefone: ${lead.telefone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.grupo ? `Grupo: ${lead.grupo}` : null,
      lead.fonte ? `Fonte: ${lead.fonte}` : null,
      `Corretor: ${corretorNome}`,
    ].filter(Boolean);
    await sendWhatsAppNotification(numero, linhas.join("\n"));
  } catch (e) {
    console.error("[notificarMonitor] falha", e);
  }
}

export async function notificarCorretorPorLead(
  supabaseClient: any,
  leadId: string,
): Promise<{ ok: boolean; error?: string; motivo?: MotivoFalha }> {
  const { data: lead, error } = await supabaseClient
    .from("leads")
    .select("id, nome, telefone, email, corretor_id, grupo_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, motivo: "tentar_de_novo" };
  if (!lead) return { ok: false, error: "Lead não encontrado", motivo: "definitivo" };
  if (!lead.corretor_id) return { ok: false, error: "Lead sem corretor", motivo: "definitivo" };

  if (await notificacoesPausadas(supabaseClient)) {
    return { ok: false, error: "Notificações pausadas", motivo: "adiar" };
  }

  // Só notifica dentro do horário de atendimento do grupo do lead
  if (lead.grupo_id) {
    const { data: dentro } = await supabaseClient.rpc("dentro_do_horario", { p_grupo_id: lead.grupo_id });
    if (dentro === false) {
      return { ok: false, error: "Fora do horário de atendimento", motivo: "adiar" };
    }
  }


  const { data: corretor, error: corretorError } = await supabaseClient

    .from("corretores")
    .select("id, nome, telefone")
    .eq("id", lead.corretor_id)
    .maybeSingle();

  if (corretorError) return { ok: false, error: corretorError.message, motivo: "tentar_de_novo" };
  if (!corretor?.telefone) return { ok: false, error: "Corretor sem telefone cadastrado", motivo: "definitivo" };

  const result = await sendWhatsAppNotification(corretor.telefone, mensagemNovoLead(lead));
  if (!result.ok) return { ok: false, error: result.error, motivo: result.permanente ? "definitivo" : "tentar_de_novo" };

  await supabaseClient
    .from("fila_notificacoes")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("lead_id", lead.id)
    .eq("corretor_id", corretor.id)
    .eq("tipo", "whatsapp")
    .eq("status", "pendente");

  return { ok: true };
}

export function mensagemLeadRepetido(lead: { nome: string; telefone?: string | null }, mensagem?: string | null) {
  const resumo = mensagem ? String(mensagem).trim().slice(0, 300) : "";
  const linhas = [
    "🔁 *Cliente voltou a entrar em contato — Alexandria Leds*",
    `Nome: ${lead.nome}`,
    lead.telefone ? `Telefone: ${lead.telefone}` : null,
    resumo ? `Mensagem: ${resumo}` : null,
    "",
    "Este cliente já é seu lead. Retome o atendimento agora.",
  ].filter(Boolean);
  return linhas.join("\n");
}

/**
 * Avisa o corretor que JÁ atende o lead quando o mesmo cliente entra de novo.
 * Respeita a pausa global e o horário de atendimento, como o aviso de lead novo.
 */
export async function notificarCorretorLeadRepetido(
  supabaseClient: any,
  leadId: string,
  mensagem?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: lead, error } = await supabaseClient
    .from("leads")
    .select("id, nome, telefone, corretor_id, grupo_id")
    .eq("id", leadId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!lead) return { ok: false, error: "Lead não encontrado" };
  if (!lead.corretor_id) return { ok: false, error: "Lead sem corretor" };

  if (await notificacoesPausadas(supabaseClient)) return { ok: false, error: "Notificações pausadas" };

  if (lead.grupo_id) {
    const { data: dentro } = await supabaseClient.rpc("dentro_do_horario", { p_grupo_id: lead.grupo_id });
    if (dentro === false) return { ok: false, error: "Fora do horário de atendimento" };
  }

  const { data: corretor, error: corretorError } = await supabaseClient
    .from("corretores")
    .select("id, telefone")
    .eq("id", lead.corretor_id)
    .maybeSingle();
  if (corretorError) return { ok: false, error: corretorError.message };
  if (!corretor?.telefone) return { ok: false, error: "Corretor sem telefone cadastrado" };

  return sendWhatsAppNotification(corretor.telefone, mensagemLeadRepetido(lead, mensagem));
}

export async function processarNotificacoesWhatsAppPendentes(
  supabaseClient: any,
  limit = 20,
): Promise<{ enviados: number; adiados: number; repetir: number; falhas: Array<{ id: string; motivo: string }> }> {
  const agora = new Date();
  const { data: pendentes, error } = await supabaseClient
    .from("fila_notificacoes")
    .select("id, lead_id, corretor_id, tentativas, created_at")
    .eq("tipo", "whatsapp")
    .eq("status", "pendente")
    .lte("proxima_tentativa", agora.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let enviados = 0;
  let adiados = 0;
  let repetir = 0;
  const falhas: Array<{ id: string; motivo: string }> = [];
  const leadsProcessados = new Set<string>();

  for (const item of pendentes ?? []) {
    // Reserva a linha por 3 min: se outra execução da fila estiver rodando ao mesmo tempo,
    // só uma delas envia (evita aviso em dobro).
    const { data: reservada } = await supabaseClient
      .from("fila_notificacoes")
      .update({ proxima_tentativa: new Date(Date.now() + 3 * 60_000).toISOString() })
      .eq("id", item.id)
      .eq("status", "pendente")
      .lte("proxima_tentativa", agora.toISOString())
      .select("id");
    if (!reservada?.length) continue;

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
      await supabaseClient
        .from("fila_notificacoes")
        .update({ status: "enviado", enviado_em: new Date().toISOString(), ultimo_erro: null })
        .eq("id", item.id);
      continue;
    }

    // Falhou: decide entre esperar (pausa/fora do horário), repetir daqui a pouco ou desistir.
    const d = decidirAposFalha({
      motivo: result.motivo ?? "tentar_de_novo",
      erro: result.error ?? "Falha ao enviar",
      tentativas: item.tentativas ?? 0,
      criadoEm: new Date(item.created_at),
      agora: new Date(),
    });
    if (d.status === "pendente") {
      if (result.motivo === "adiar") adiados++;
      else repetir++;
    } else {
      falhas.push({ id: item.id, motivo: d.erro ?? "Falha ao enviar" });
    }
    await supabaseClient
      .from("fila_notificacoes")
      .update({
        status: d.status,
        tentativas: d.tentativas,
        proxima_tentativa: d.proxima.toISOString(),
        ultimo_erro: d.erro,
        ...(d.status === "pendente" ? {} : { enviado_em: new Date().toISOString() }),
      })
      .eq("id", item.id)
      .eq("status", "pendente");
  }

  return { enviados, adiados, repetir, falhas };
}
