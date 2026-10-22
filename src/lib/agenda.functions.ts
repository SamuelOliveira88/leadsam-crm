import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ehNumeroMae, leadSemTelefone, souCorretorPuro, listaEstaBlindada } from "@/lib/telefone-oculto";
import { STATUS_COMPROMISSO, TIPOS_COMPROMISSO } from "@/lib/agenda";

// ============ AGENDA ============
// O banco (RLS) decide quem vê/mexe: corretor só os seus, gerente os do grupo, master a empresa.

function traduzirErro(msg: string): string {
  if (/row-level security/i.test(msg)) return "Você não tem permissão para agendar para este corretor.";
  return msg;
}

async function empresaDoUsuario(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase.from("perfis").select("empresa_id").eq("id", context.userId).maybeSingle();
  if (!data?.empresa_id) throw new Error("Seu perfil não está ligado a uma empresa.");
  return data.empresa_id as string;
}

export const listarCompromissos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ de: z.string().datetime(), ate: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const empresaId = await empresaDoUsuario(context);
    const oculta = await souCorretorPuro(context.supabase, context.userId);
    const blind = oculta ? await listaEstaBlindada(context.supabase) : true;
    const { data: rows, error } = await context.supabase
      .from("compromissos")
      .select("id, lead_id, corretor_id, empreendimento, data_hora, tipo, status, observacoes, leads(nome, telefone, fonte), corretores(nome)")
      .eq("empresa_id", empresaId)
      .gte("data_hora", data.de)
      .lt("data_hora", data.ate)
      .order("data_hora", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      lead_id: (r.lead_id as string | null) ?? null,
      corretor_id: (r.corretor_id as string | null) ?? null,
      empreendimento: (r.empreendimento as string | null) ?? null,
      data_hora: r.data_hora as string,
      tipo: r.tipo as string,
      status: r.status as string,
      observacoes: (r.observacoes as string | null) ?? null,
      lead_nome: ((oculta && ehNumeroMae(r.leads, blind) ? leadSemTelefone(r.leads) : r.leads)?.nome as string | undefined) ?? null,
      lead_telefone: oculta && ehNumeroMae(r.leads, blind) ? null : ((r.leads?.telefone as string | undefined) ?? null),
      corretor_nome: (r.corretores?.nome as string | undefined) ?? null,
    }));
  });

/** Corretores e empreendimentos que a pessoa pode escolher ao agendar. */
export const opcoesAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresaId = await empresaDoUsuario(context);
    const [{ data: corretores }, { data: empreendimentos }] = await Promise.all([
      context.supabase.from("corretores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      context.supabase.from("empreendimentos").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    ]);
    return {
      corretores: (corretores ?? []) as Array<{ id: string; nome: string }>,
      empreendimentos: (empreendimentos ?? []) as Array<{ id: string; nome: string }>,
    };
  });

const AgendarInput = z.object({
  lead_id: z.string().uuid(),
  tipo: z.enum(TIPOS_COMPROMISSO),
  data_hora: z.string().datetime(),
  empreendimento: z.string().trim().max(120).optional().nullable(),
  corretor_id: z.string().uuid().optional().nullable(),
  observacoes: z.string().trim().max(1000).optional().nullable(),
});

export const agendarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AgendarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("agendar_compromisso", {
      p_lead_id: data.lead_id,
      p_tipo: data.tipo,
      p_data_hora: data.data_hora,
      p_empreendimento: data.empreendimento ?? undefined,
      p_corretor_id: data.corretor_id ?? undefined,
      p_observacoes: data.observacoes ?? undefined,
    });
    if (error) throw new Error(traduzirErro(error.message));
    return r as unknown as { id: string; tipo: string; data_hora: string; lead_nome: string | null };
  });

const AtualizarInput = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUS_COMPROMISSO).optional(),
  data_hora: z.string().datetime().optional(),
  empreendimento: z.string().trim().max(120).optional().nullable(),
  observacoes: z.string().trim().max(1000).optional().nullable(),
});

export const atualizarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AtualizarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...resto } = data;
    const patch: { status?: string; data_hora?: string; empreendimento?: string | null; observacoes?: string | null } = {};
    if (resto.status !== undefined) patch.status = resto.status;
    if (resto.data_hora !== undefined) patch.data_hora = resto.data_hora;
    if (resto.empreendimento !== undefined) patch.empreendimento = resto.empreendimento?.trim() || null;
    if (resto.observacoes !== undefined) patch.observacoes = resto.observacoes?.trim() || null;
    if (Object.keys(patch).length === 0) throw new Error("Nada para alterar.");

    const { data: rows, error } = await context.supabase.from("compromissos").update(patch).eq("id", id).select("id");
    if (error) throw new Error(traduzirErro(error.message));
    if (!rows?.length) throw new Error("Você não tem permissão para alterar este compromisso.");
    return { ok: true };
  });
