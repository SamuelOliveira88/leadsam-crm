import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Gera o link de pagamento do plano para a imobiliária do master que está logado.
export const criarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plano: z.enum(["alexandria", "alexandria_ia"]),
    dados: z.object({
      i_nome: z.string().trim().min(3).max(200), i_cnpj: z.string().trim().min(11).max(30), i_creci: z.string().max(40).default(""),
      i_endereco: z.string().max(300).default(""), i_email: z.string().max(200).default(""), i_whats: z.string().max(40).default(""),
      i_rep: z.string().trim().min(3).max(200), i_cpf: z.string().trim().min(11).max(20),
    }),
    aceito: z.literal(true),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as any;
    const { data: perfil } = await sb.from("perfis").select("role, empresa_id").eq("id", context.userId).maybeSingle();
    if (!perfil?.empresa_id || perfil.role !== "master") throw new Error("Só o master da imobiliária contrata o plano.");
    const { VERSAO_CONTRATO } = await import("@/lib/contrato");
    const { error: eAceite } = await sb.from("aceites_contrato").insert({
      empresa_id: perfil.empresa_id, user_id: context.userId, plano: data.plano, versao: VERSAO_CONTRATO, dados: data.dados,
    });
    if (eAceite) throw new Error("Não consegui registrar o aceite do contrato: " + eAceite.message);
    const { criarLinkPagamento } = await import("@/lib/asaas.server");
    const r = await criarLinkPagamento(perfil.empresa_id, data.plano);
    return { url: r.url };
  });
