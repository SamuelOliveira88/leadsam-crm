import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ TOKENS DE WEBHOOK (master da empresa / super-admin) ============
// O token em texto puro só existe no momento da criação. No banco fica apenas o hash (SHA-256).

async function exigirMasterDaEmpresa(context: { supabase: any; userId: string }): Promise<string> {
  const { data: perfil } = await context.supabase
    .from("perfis")
    .select("role, super_admin, empresa_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!perfil?.empresa_id) throw new Error("Seu perfil não está ligado a uma empresa.");
  if (!(perfil.super_admin || perfil.role === "master")) {
    throw new Error("Apenas o master da empresa pode gerenciar tokens.");
  }
  return perfil.empresa_id as string;
}

export const listarTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresaId = await exigirMasterDaEmpresa(context);
    const { data, error } = await context.supabase
      .from("webhook_tokens")
      .select("id, nome, ativo, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CriarTokenInput = z.object({
  nome: z.string().trim().min(2, "Dê um nome com pelo menos 2 letras").max(60, "Nome muito longo"),
});

export const criarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CriarTokenInput.parse(d))
  .handler(async ({ data, context }) => {
    const empresaId = await exigirMasterDaEmpresa(context);
    const { gerarTokenWebhook } = await import("@/lib/empresa-token.server");
    const { token, hash } = await gerarTokenWebhook();

    const { data: row, error } = await context.supabase
      .from("webhook_tokens")
      .insert({ empresa_id: empresaId, nome: data.nome, token_hash: hash })
      .select("id, nome, ativo, created_at")
      .single();
    if (error) throw new Error(error.message);

    // `token` é devolvido UMA única vez, aqui. Não há como recuperá-lo depois.
    return { ...row, token };
  });

const AtivoInput = z.object({ id: z.string().uuid(), ativo: z.boolean() });

export const definirTokenAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AtivoInput.parse(d))
  .handler(async ({ data, context }) => {
    const empresaId = await exigirMasterDaEmpresa(context);
    const { data: row, error } = await context.supabase
      .from("webhook_tokens")
      .update({ ativo: data.ativo })
      .eq("id", data.id)
      .eq("empresa_id", empresaId)
      .select("id, nome, ativo, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Token não encontrado.");
    return row;
  });
