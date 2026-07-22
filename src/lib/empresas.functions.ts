import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ GESTÃO DE EMPRESAS (só super-admin) ============
export const listarEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("super_admin").eq("id", context.userId).maybeSingle();
    if (!perfil?.super_admin) throw new Error("Apenas o super-admin pode ver esta tela.");

    const { data, error } = await context.supabase
      .from("empresas")
      .select("id, nome, slug, plano, limite_corretores, limite_leads_mes, ativo, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Uso atual de cada empresa (pra comparar com o limite do plano)
    const { data: corretoresPorEmpresa } = await context.supabase.from("corretores").select("empresa_id");
    const { data: leadsPorEmpresa } = await context.supabase.from("leads").select("empresa_id");
    const contarPor = (rows: any[] | null, id: string) => (rows ?? []).filter((r) => r.empresa_id === id).length;

    return (data ?? []).map((e) => ({
      ...e,
      corretores_em_uso: contarPor(corretoresPorEmpresa, e.id),
      leads_em_uso: contarPor(leadsPorEmpresa, e.id),
    }));
  });

const EmpresaInput = z.object({
  nome: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  plano: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  limite_corretores: z.number().int().optional().nullable(),
  limite_leads_mes: z.number().int().optional().nullable(),
});

export const criarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EmpresaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("super_admin").eq("id", context.userId).maybeSingle();
    if (!perfil?.super_admin) throw new Error("Apenas o super-admin pode criar empresas.");

    const { data: emp, error } = await context.supabase.from("empresas").insert(data).select().single();
    if (error) throw new Error(error.message);
    return emp;
  });

const AtualizarEmpresaInput = z.object({
  id: z.string().uuid(),
  nome: z.string().optional(),
  plano: z.enum(["starter", "pro", "enterprise"]).optional(),
  limite_corretores: z.number().int().optional().nullable(),
  limite_leads_mes: z.number().int().optional().nullable(),
  ativo: z.boolean().optional(),
});

export const atualizarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AtualizarEmpresaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("super_admin").eq("id", context.userId).maybeSingle();
    if (!perfil?.super_admin) throw new Error("Apenas o super-admin pode editar empresas.");

    const { id, ...campos } = data;
    const { error } = await context.supabase.from("empresas").update(campos).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ CRIAÇÃO DE EMPRESA + MASTER (apenas super-admin) ============
const CadastroEmpresaInput = z.object({
  nome_empresa: z.string().min(2),
  nome_usuario: z.string().min(2),
  email: z.string().email(),
});

function gerarSlug(nome: string): string {
  const base = nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export const cadastrarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CadastroEmpresaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("super_admin").eq("id", context.userId).maybeSingle();
    if (!perfil?.super_admin) throw new Error("Apenas o super-admin pode cadastrar novas imobiliárias.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const slug = gerarSlug(data.nome_empresa);
    const { data: empresa, error: eErr } = await supabaseAdmin
      .from("empresas")
      .insert({ nome: data.nome_empresa, slug, plano: "starter" })
      .select()
      .single();
    if (eErr) throw new Error(eErr.message);

    // Envia convite por e-mail — o usuário define a própria senha em /set-password
    const redirectTo = `${process.env.SITE_URL ?? "https://alexandria-leds.lovable.app"}/set-password`;
    const { error: iErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo,
      data: { role: "master", empresa_id: empresa.id, nome: data.nome_usuario },
    });
    if (iErr) {
      // desfaz a empresa se o convite falhar (ex: e-mail já existe)
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      throw new Error(iErr.message);
    }

    return { ok: true, empresa };
  });

