import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Gera o link de pagamento do plano para a imobiliária do master que está logado.
export const criarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plano: z.enum(["alexandria", "alexandria_ia"]),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as any;
    const { data: perfil } = await sb.from("perfis").select("role, empresa_id").eq("id", context.userId).maybeSingle();
    if (!perfil?.empresa_id || perfil.role !== "master") throw new Error("Só o master da imobiliária contrata o plano.");
    const { criarLinkPagamento } = await import("@/lib/asaas.server");
    const r = await criarLinkPagamento(perfil.empresa_id, data.plano);
    return { url: r.url };
  });

// Compra de corretores extras (além dos 10 incluídos). O limite sobe quando o Asaas confirma o pagamento.
export const criarPagamentoExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ extras: z.number().int().min(1).max(90) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as any;
    const { data: perfil } = await sb.from("perfis").select("role, empresa_id").eq("id", context.userId).maybeSingle();
    if (!perfil?.empresa_id || perfil.role !== "master") throw new Error("Só o master da imobiliária contrata corretores extras.");
    const { data: pl } = await sb.rpc("meu_plano");
    const efetivo = pl?.efetivo;
    if (efetivo !== "alexandria" && efetivo !== "alexandria_ia") throw new Error("Assine um plano antes de contratar corretores extras.");
    const { criarLinkPagamento } = await import("@/lib/asaas.server");
    const r = await criarLinkPagamento(perfil.empresa_id, efetivo, data.extras);
    return { url: r.url };
  });
