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
      .select("id, nome, slug, plano, limite_corretores, limite_leads_mes, ativo, created_at, status, teste_ate")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Uso atual de cada empresa (pra comparar com o limite do plano)
    // Contagem de todas as empresas: usa o cliente de serviço (a trava por empresa ativa vale só nas telas de dados)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: corretoresPorEmpresa } = await supabaseAdmin.from("corretores").select("empresa_id");
    const { data: leadsPorEmpresa } = await supabaseAdmin.from("leads").select("empresa_id").limit(100000);
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
  status: z.enum(["teste", "ativa", "em_atraso", "suspensa"]).optional(),
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
  iniciar_teste: z.boolean().optional(),
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
      .insert({
        nome: data.nome_empresa,
        slug,
        plano: "starter",
        ...(data.iniciar_teste
          ? { status: "teste", teste_ate: new Date(Date.now() + 7 * 86400000).toISOString() }
          : {}),
      })
      .select()
      .single();
    if (eErr) throw new Error(eErr.message);

    // Registra o convite no servidor (define cargo/empresa com segurança)
    await supabaseAdmin.from("convites_admin").insert({
      email: data.email.toLowerCase(),
      role: "master",
      empresa_id: empresa.id,
      nome: data.nome_usuario,
      criado_por: context.userId,
    });

    // Envia convite por e-mail — o usuário define a própria senha em /set-password
    const redirectTo = `${(process.env.SITE_URL || "https://www.alexandrialeads.app").replace(/\/+$/, "")}/set-password`;
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


// ============ TESTE DE 7 DIAS (só super-admin) ============
const AcaoTesteInput = z.object({
  id: z.string().uuid(),
  acao: z.enum(["iniciar", "prorrogar", "ativar"]),
});

export const acaoTesteEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AcaoTesteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("perfis").select("super_admin").eq("id", context.userId).maybeSingle();
    if (!perfil?.super_admin) throw new Error("Apenas o super-admin pode alterar o teste.");

    const DIA = 86400000;
    let campos: Record<string, unknown>;
    if (data.acao === "iniciar") {
      campos = { status: "teste", teste_ate: new Date(Date.now() + 7 * DIA).toISOString(), ativo: true };
    } else if (data.acao === "prorrogar") {
      const { data: atual } = await context.supabase
        .from("empresas").select("teste_ate").eq("id", data.id).maybeSingle();
      const base = Math.max(Date.now(), atual?.teste_ate ? new Date(atual.teste_ate).getTime() : 0);
      campos = { status: "teste", teste_ate: new Date(base + 7 * DIA).toISOString(), ativo: true };
    } else {
      campos = { status: "ativa", teste_ate: null };
    }
    const { error } = await context.supabase.from("empresas").update(campos as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Situação da empresa de quem está logado (faixa de teste e bloqueio). */
export const statusMinhaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil } = await supabaseAdmin
      .from("perfis").select("empresa_id, super_admin").eq("id", context.userId).maybeSingle();
    const vazio = { status: "ativa", teste_ate: null as string | null, dias_restantes: null as number | null, bloqueada: false, super_admin: !!perfil?.super_admin };
    if (!perfil?.empresa_id) return vazio;
    const { data: emp } = await (supabaseAdmin as any)
      .from("empresas").select("status, teste_ate").eq("id", perfil.empresa_id).maybeSingle();
    if (!emp?.status) return vazio;
    const fim = emp.teste_ate ? new Date(emp.teste_ate).getTime() : null;
    const venceu = emp.status === "teste" && fim !== null && fim < Date.now();
    return {
      status: emp.status as string,
      teste_ate: (emp.teste_ate ?? null) as string | null,
      dias_restantes: emp.status === "teste" && fim !== null ? Math.max(0, Math.ceil((fim - Date.now()) / 86400000)) : null,
      bloqueada: emp.status === "suspensa" || venceu,
      super_admin: !!perfil.super_admin,
    };
  });
