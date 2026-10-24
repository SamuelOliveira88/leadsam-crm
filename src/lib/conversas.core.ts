import { nomeSemNumero } from "@/lib/telefone-oculto";

// ============ CONVERSAS DO NÚMERO MÃE ============
// Tudo roda com o cliente do próprio usuário: quem decide o que cada um vê é o banco (RLS),
// a mesma regra dos leads. Aqui só listamos e enviamos.

// Só master, gerente e super admin veem o telefone do cliente. Corretor vê só o nome.
export async function podeVerTelefone(sb: any, userId: string): Promise<boolean> {
  const { data: perfil } = await sb.from("perfis").select("role").eq("id", userId).maybeSingle();
  if (perfil?.role === "master" || perfil?.role === "gerente") return true;
  const { data: sa } = await sb.rpc("sou_super_admin");
  return sa === true;
}

// Quando o cliente não tem nome no WhatsApp o lead recebe o próprio número como nome: também esconde.

export type ConversaResumo = {
  lead_id: string;
  nome: string;
  telefone: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  ultima_texto: string | null;
  ultima_direcao: "entrada" | "saida";
  ultima_em: string;
  total: number;
  /** Lead de lista que ainda não conversou: aparece para o corretor iniciar a conversa. */
  nova?: boolean;
};

export type MensagemConversa = {
  id: string;
  direcao: "entrada" | "saida";
  texto: string | null;
  midia_tipo: string | null;
  status: "recebida" | "pendente" | "enviada" | "erro";
  corretor_nome: string | null;
  created_at: string;
};


export async function listarConversasCore(sb: any, userId: string): Promise<ConversaResumo[]> {

        const verTel = await podeVerTelefone(sb, userId);
    const { data: msgs, error } = await sb
      .from("lead_mensagens")
      .select("lead_id, direcao, texto, midia_tipo, created_at")
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw new Error(error.message);

    const porLead = new Map<string, { ult: any; total: number }>();
    for (const m of (msgs ?? []) as any[]) {
      const x = porLead.get(m.lead_id);
      if (x) x.total += 1;
      else porLead.set(m.lead_id, { ult: m, total: 1 });
    }
    const ids = [...porLead.keys()];

    const { data: leads, error: e2 } = await sb
      .from("leads").select("id, nome, telefone, corretor_id").in("id", ids);
    if (e2) throw new Error(e2.message);
    const corIds = [...new Set(((leads ?? []) as any[]).map((l) => l.corretor_id).filter(Boolean))];
    const nomes = new Map<string, string>();
    if (corIds.length) {
      const { data: cs } = await sb.from("corretores").select("id, nome").in("id", corIds);
      for (const c of (cs ?? []) as any[]) nomes.set(c.id, c.nome);
    }

    // Leads de lista (planilha) que ainda não têm conversa: o corretor pode mandar a primeira mensagem.
    const { data: novos } = await sb
      .from("leads")
      .select("id, nome, telefone, corretor_id, created_at")
      .eq("fonte", "planilha_samuelimob")
      .order("created_at", { ascending: false })
      .limit(300);
    const novosSemConversa = ((novos ?? []) as any[]).filter((l) => !porLead.has(l.id));
    const corIdsNovos = [...new Set(novosSemConversa.map((l) => l.corretor_id).filter((i) => i && !nomes.has(i)))];
    if (corIdsNovos.length) {
      const { data: cs2 } = await sb.from("corretores").select("id, nome").in("id", corIdsNovos);
      for (const c of (cs2 ?? []) as any[]) nomes.set(c.id, c.nome);
    }
    const resumoNovos: ConversaResumo[] = novosSemConversa.map((l) => ({
      lead_id: l.id,
      nome: verTel ? l.nome : nomeSemNumero(l.nome),
      telefone: verTel ? l.telefone : null,
      corretor_id: l.corretor_id,
      corretor_nome: l.corretor_id ? nomes.get(l.corretor_id) ?? null : null,
      ultima_texto: "Ainda sem conversa. Toque para mandar a primeira mensagem.",
      ultima_direcao: "saida",
      ultima_em: l.created_at,
      total: 0,
      nova: true,
    }));

    const comConversa = ((leads ?? []) as any[])
      .map((l) => {
        const x = porLead.get(l.id)!;
        return {
          lead_id: l.id,
          nome: verTel ? l.nome : nomeSemNumero(l.nome),
          telefone: verTel && !String(l.telefone ?? "").startsWith("sem-numero-") ? l.telefone : null,
          corretor_id: l.corretor_id,
          corretor_nome: l.corretor_id ? nomes.get(l.corretor_id) ?? null : null,
          ultima_texto: x.ult.texto ?? (x.ult.midia_tipo ? `[${x.ult.midia_tipo}]` : null),
          ultima_direcao: x.ult.direcao,
          ultima_em: x.ult.created_at,
          total: x.total,
        } as ConversaResumo;
      })
      .sort((a, b) => (a.ultima_em < b.ultima_em ? 1 : -1));
    return [...comConversa, ...resumoNovos];
}

export async function mensagensDoLeadCore(sb: any, leadId: string): Promise<MensagemConversa[]> {

        const { data: msgs, error } = await sb
      .from("lead_mensagens")
      .select("id, direcao, texto, midia_tipo, status, corretor_id, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const corIds = [...new Set(((msgs ?? []) as any[]).map((m) => m.corretor_id).filter(Boolean))];
    const nomes = new Map<string, string>();
    if (corIds.length) {
      const { data: cs } = await sb.from("corretores").select("id, nome").in("id", corIds);
      for (const c of (cs ?? []) as any[]) nomes.set(c.id, c.nome);
    }
    return ((msgs ?? []) as any[]).map((m) => ({
      id: m.id,
      direcao: m.direcao,
      texto: m.texto,
      midia_tipo: m.midia_tipo,
      status: m.status,
      corretor_nome: m.corretor_id ? nomes.get(m.corretor_id) ?? null : null,
      created_at: m.created_at,
    }));
}

export async function enviarMensagemCore(sb: any, leadId: string, texto: string) {

    // O banco confere tudo de novo (lead visível, já escreveu primeiro, sem opt-out) e enfileira o envio.
    const { error } = await sb
      .from("lead_mensagens")
      .insert({ lead_id: leadId, direcao: "saida", texto: texto });
    if (error) throw new Error(error.message);
    return { ok: true };
}

export async function enviarAudioCore(sb: any, leadId: string, mimetype: string, base64: string) {
  // O banco confere tudo (lead visível, cliente já escreveu, tamanho, formato) e enfileira o envio.
  const { error } = await sb
    .from("lead_mensagens")
    .insert({ lead_id: leadId, direcao: "saida", midia_tipo: "audio", audio_dados: base64, audio_mimetype: mimetype });
  if (error) throw new Error(error.message);
  return { ok: true };
}
