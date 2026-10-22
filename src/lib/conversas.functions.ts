import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ CONVERSAS DO NÚMERO MÃE ============
// Tudo roda com o cliente do próprio usuário: quem decide o que cada um vê é o banco (RLS),
// a mesma regra dos leads. Aqui só listamos e enviamos.

// Só master, gerente e super admin veem o telefone do cliente. Corretor vê só o nome.
async function podeVerTelefone(sb: any, userId: string): Promise<boolean> {
  const { data: perfil } = await sb.from("perfis").select("role").eq("id", userId).maybeSingle();
  if (perfil?.role === "master" || perfil?.role === "gerente") return true;
  const { data: sa } = await sb.rpc("sou_super_admin");
  return sa === true;
}

// Quando o cliente não tem nome no WhatsApp o lead recebe o próprio número como nome: também esconde.
function nomeSemNumero(nome: string | null): string {
  const n = (nome ?? "").trim();
  return n.replace(/\D/g, "").length >= 8 ? "Cliente sem nome" : n || "Cliente";
}

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

export const listarConversas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversaResumo[]> => {
    const sb = context.supabase as any;
    const verTel = await podeVerTelefone(sb, context.userId);
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
    if (ids.length === 0) return [];

    const { data: leads, error: e2 } = await sb
      .from("leads").select("id, nome, telefone, corretor_id").in("id", ids);
    if (e2) throw new Error(e2.message);
    const corIds = [...new Set(((leads ?? []) as any[]).map((l) => l.corretor_id).filter(Boolean))];
    const nomes = new Map<string, string>();
    if (corIds.length) {
      const { data: cs } = await sb.from("corretores").select("id, nome").in("id", corIds);
      for (const c of (cs ?? []) as any[]) nomes.set(c.id, c.nome);
    }

    return ((leads ?? []) as any[])
      .map((l) => {
        const x = porLead.get(l.id)!;
        return {
          lead_id: l.id,
          nome: verTel ? l.nome : nomeSemNumero(l.nome),
          telefone: verTel ? l.telefone : null,
          corretor_id: l.corretor_id,
          corretor_nome: l.corretor_id ? nomes.get(l.corretor_id) ?? null : null,
          ultima_texto: x.ult.texto ?? (x.ult.midia_tipo ? `[${x.ult.midia_tipo}]` : null),
          ultima_direcao: x.ult.direcao,
          ultima_em: x.ult.created_at,
          total: x.total,
        } as ConversaResumo;
      })
      .sort((a, b) => (a.ultima_em < b.ultima_em ? 1 : -1));
  });

export const mensagensDoLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MensagemConversa[]> => {
    const sb = context.supabase as any;
    const { data: msgs, error } = await sb
      .from("lead_mensagens")
      .select("id, direcao, texto, midia_tipo, status, corretor_id, created_at")
      .eq("lead_id", data.lead_id)
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
  });

export const enviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: z.string().uuid(), texto: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // O banco confere tudo de novo (lead visível, já escreveu primeiro, sem opt-out) e enfileira o envio.
    const { error } = await (context.supabase as any)
      .from("lead_mensagens")
      .insert({ lead_id: data.lead_id, direcao: "saida", texto: data.texto });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
