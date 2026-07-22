import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarDocumentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ proposta_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: docs, error } = await context.supabase
      .from("documentos_propostas")
      .select("id, tipo_documento, pessoa, nome_arquivo, storage_path, created_at")
      .eq("proposta_id", data.proposta_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const comUrl = await Promise.all(
      (docs ?? []).map(async (d: any) => {
        const { data: signed } = await context.supabase.storage
          .from("documentos-propostas")
          .createSignedUrl(d.storage_path, 60 * 10);
        return { ...d, url: signed?.signedUrl ?? null };
      }),
    );
    return comUrl;
  });

const RegistrarInput = z.object({
  proposta_id: z.string().uuid(),
  tipo_documento: z.string().min(1),
  pessoa: z.enum(["titular", "conjuge", "procurador", "outro"]),
  nome_arquivo: z.string().min(1),
  storage_path: z.string().min(1),
});

export const registrarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegistrarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documentos_propostas").insert({
      proposta_id: data.proposta_id,
      tipo_documento: data.tipo_documento,
      pessoa: data.pessoa,
      nome_arquivo: data.nome_arquivo,
      storage_path: data.storage_path,
      enviado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), storage_path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.storage.from("documentos-propostas").remove([data.storage_path]);
    const { error } = await context.supabase.from("documentos_propostas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ ANÁLISE DE CRÉDITO (só master/gerente decidem) ============
const CreditoInput = z.object({
  id: z.string().uuid(),
  status_credito: z.enum(["pendente", "aprovado", "reprovado"]),
  credito_observacoes: z.string().optional().nullable(),
});

export const definirStatusCredito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreditoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("role, super_admin").eq("id", context.userId).maybeSingle();
    const podeDecidir = ["master", "gerente", "financeiro"].includes(perfil?.role ?? "") || perfil?.super_admin;
    if (!podeDecidir) {
      throw new Error("Apenas master, gerente ou financeiro podem decidir a análise de crédito.");
    }
    const { error } = await context.supabase
      .from("propostas")
      .update({
        status_credito: data.status_credito,
        credito_observacoes: data.credito_observacoes ?? null,
        credito_analisado_por: context.userId,
        credito_analisado_em: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
