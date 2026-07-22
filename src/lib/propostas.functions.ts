import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarPropostas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("propostas")
      .select(`
        id, lead_id, unidade_id, corretor_id, valor_proposto, valor_entrada, parcelas,
        condicoes, status, motivo_recusa, observacoes, created_at, atualizado_em,
        leads(nome, telefone), unidades(numero, torre), corretores(nome)
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const PropostaInput = z.object({
  lead_id: z.string().uuid(),
  unidade_id: z.string().uuid().optional().nullable(),
  valor_proposto: z.number().positive(),
  valor_entrada: z.number().optional().nullable(),
  parcelas: z.number().int().optional().nullable(),
  condicoes: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export const criarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PropostaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("role, corretor_id").eq("id", context.userId).maybeSingle();

    const { data: row, error } = await context.supabase
      .from("propostas")
      .insert({
        lead_id: data.lead_id,
        unidade_id: data.unidade_id ?? null,
        corretor_id: perfil?.corretor_id ?? null,
        valor_proposto: data.valor_proposto,
        valor_entrada: data.valor_entrada ?? null,
        parcelas: data.parcelas ?? null,
        condicoes: data.condicoes ?? null,
        observacoes: data.observacoes ?? null,
        status: "rascunho",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const AtualizarPropostaInput = z.object({
  id: z.string().uuid(),
  valor_proposto: z.number().positive().optional(),
  valor_entrada: z.number().optional().nullable(),
  parcelas: z.number().int().optional().nullable(),
  condicoes: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export const atualizarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AtualizarPropostaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...campos } = data;
    const { error } = await context.supabase.from("propostas").update(campos).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Corretor envia a proposta (rascunho -> enviada)
export const enviarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("propostas").update({ status: "enviada" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Master/gerente decidem a proposta
const DecisaoInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["em_analise", "aprovada", "recusada", "cancelada"]),
  motivo_recusa: z.string().optional().nullable(),
});

export const decidirProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecisaoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("propostas")
      .update({ status: data.status, motivo_recusa: data.motivo_recusa ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Ao aprovar, marca a unidade vinculada (se houver) como vendida automaticamente
    if (data.status === "aprovada") {
      const { data: proposta } = await context.supabase
        .from("propostas").select("unidade_id").eq("id", data.id).maybeSingle();
      if (proposta?.unidade_id) {
        await context.supabase.from("unidades").update({ status: "vendida" }).eq("id", proposta.unidade_id);
      }
    }
    return { ok: true };
  });

export const excluirProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("propostas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
