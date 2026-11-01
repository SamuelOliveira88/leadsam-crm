import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CorretorInput = z.object({
  nome: z.string().min(1),
  telefone: z.string().optional().nullable(),
  grupo_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
  canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
  recebe_via_web: z.boolean().default(true),
  recebe_via_whatsapp: z.boolean().default(true),
});

export const listarCorretores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("corretores")
      .select("id, nome, telefone, grupo_id, ativo, canal_notificacao, recebe_via_web, recebe_via_whatsapp, liberado_ate, ultimo_ping, created_at, grupos(nome)")
      .order("nome");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CorretorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("corretores").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const atualizarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: CorretorInput.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("corretores")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const excluirCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("corretores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convidarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    nome: z.string().min(1),
    email: z.string().email(),
    telefone: z.string().optional().nullable(),
    grupo_id: z.string().uuid().nullable().optional(),
    canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
    recebe_via_web: z.boolean().default(true),
    recebe_via_whatsapp: z.boolean().default(true),
    redirect_to: z.string().url(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Só o master pode convidar
    const { data: perfil } = await context.supabase
      .from("perfis").select("role, empresa_id").eq("id", context.userId).maybeSingle();
    if (perfil?.role !== "master") throw new Error("Apenas o administrador pode convidar corretores.");

    // 1) Cria o registro do corretor (sem user_id ainda)
    const { data: corretor, error: cErr } = await context.supabase
      .from("corretores")
      .insert({
        nome: data.nome,
        telefone: data.telefone ?? null,
        grupo_id: data.grupo_id ?? null,
        empresa_id: perfil?.empresa_id ?? null,
        ativo: true,
        canal_notificacao: data.canal_notificacao,
        recebe_via_web: data.recebe_via_web,
        recebe_via_whatsapp: data.recebe_via_whatsapp,
      })
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);

    // 2) Registra o convite no servidor (fonte de verdade de cargo/empresa)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("convites_admin").insert({
      email: data.email.toLowerCase(),
      role: "corretor",
      empresa_id: perfil?.empresa_id ?? null,
      grupo_id: data.grupo_id ?? null,
      corretor_id: corretor.id,
      nome: data.nome,
      criado_por: context.userId,
    });
    const { error: iErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirect_to,
      data: {
        invited_by_admin: true,
        nome: data.nome,
        role: "corretor",
        grupo_id: data.grupo_id ?? null,
        corretor_id: corretor.id,
        empresa_id: perfil?.empresa_id ?? null,
      },
    });
    if (iErr) {
      // Rollback do corretor para não deixar registro órfão
      await context.supabase.from("corretores").delete().eq("id", corretor.id);
      throw new Error(iErr.message);
    }
    return { ok: true, corretor };
  });

export const liberarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    corretor_id: z.string().uuid(),
    minutos: z.number().int().min(5).max(24 * 60),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ate = new Date(Date.now() + data.minutos * 60_000).toISOString();
    const { error } = await context.supabase
      .from("corretores")
      .update({ liberado_ate: ate })
      .eq("id", data.corretor_id);
    if (error) throw new Error(error.message);
    return { liberado_ate: ate };
  });

export const revogarLiberacaoCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ corretor_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("corretores")
      .update({ liberado_ate: null })
      .eq("id", data.corretor_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const heartbeatCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("corretor_heartbeat");
    return { ok: true };
  });

// Reenvia link de definição de senha (recovery) para todos os corretores/gerentes
// de um grupo (ou de toda a empresa quando grupo_id é omitido). Só super_admin ou master.
export const reenviarConvitesGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    grupo_id: z.string().uuid().optional(),
    redirect_to: z.string().url(),
    apenas_pendentes: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilAtual } = await context.supabase
      .from("perfis").select("role, super_admin, acesso_total, empresa_id, grupo_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode reenviar convites.");
    }
    const acessoTotal = !!(perfilAtual?.super_admin || (perfilAtual as any)?.acesso_total);
    // Sem acesso total, o admin só opera dentro do próprio grupo.
    let grupoAlvo = data.grupo_id;
    if (!acessoTotal) {
      if (!perfilAtual?.grupo_id) throw new Error("Seu usuário não está vinculado a um grupo.");
      if (grupoAlvo && grupoAlvo !== perfilAtual.grupo_id) {
        throw new Error("Você só pode reenviar convites do seu grupo.");
      }
      grupoAlvo = perfilAtual.grupo_id;
    }

    let query = context.supabase
      .from("perfis")
      .select("id, nome, role, grupo_id, empresa_id")
      .in("role", ["corretor", "gerente"]);
    if (grupoAlvo) query = query.eq("grupo_id", grupoAlvo);
    if (perfilAtual?.empresa_id) query = query.eq("empresa_id", perfilAtual.empresa_id);


    const { data: perfis, error } = await query;
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enviados: string[] = [];
    const falhas: Array<{ email?: string; motivo: string }> = [];

    for (const p of perfis ?? []) {
      const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(p.id);
      if (uErr || !u?.user?.email) { falhas.push({ motivo: uErr?.message || "sem email" }); continue; }
      if (data.apenas_pendentes && u.user.last_sign_in_at) continue;
      const { error: rErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: u.user.email,
        options: { redirectTo: data.redirect_to },
      });
      if (rErr) falhas.push({ email: u.user.email, motivo: rErr.message });
      else enviados.push(u.user.email);
    }

    return { ok: true, enviados, falhas };
  });

// Senha interna aleatória (crypto). Nunca é devolvida a ninguém: o corretor define a dele pelo link.
function gerarSenhaInterna(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "Ax9!" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function siteUrl(): string {
  return (process.env.SITE_URL || "https://www.alexandrialeads.app").replace(/\/+$/, "");
}

/** Link de uso único para a própria pessoa definir a senha (recovery do Supabase). */
async function gerarLinkDefinirSenha(supabaseAdmin: any, email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl()}/set-password` },
  });
  const link = (data as any)?.properties?.action_link as string | undefined;
  if (error || !link) throw new Error(error?.message || "Não foi possível gerar o link de acesso.");
  return link;
}

const ERRO_JA_TEM_CONTA =
  "Este e-mail já tem conta no Alexandria. Por segurança, não é possível trocar a senha de uma conta que já existe. Use outro e-mail ou peça para a pessoa usar \"Esqueci a senha\".";

// Cadastra corretor direto (sem depender do e-mail de convite).
// Segurança (C3, revisão 01/11):
//  * só cria usuário NOVO: se o e-mail já existe no Auth, recusa (nunca troca a senha de ninguém);
//  * não devolve senha: devolve um link de uso único para o corretor definir a própria senha;
//  * grupo sempre da empresa de quem cadastra (só super admin atravessa empresas).
export const cadastrarCorretorComSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    nome: z.string().trim().min(1).max(120),
    email: z.string().email(),
    telefone: z.string().optional().nullable(),
    grupo_id: z.string().uuid().nullable().optional(),
    canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
    recebe_via_web: z.boolean().default(true),
    recebe_via_whatsapp: z.boolean().default(true),
    role: z.enum(["corretor", "gerente"]).default("corretor"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilAtual } = await context.supabase
      .from("perfis").select("role, super_admin, acesso_total, empresa_id, grupo_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode cadastrar corretores.");
    }
    const superAdmin = !!perfilAtual?.super_admin;
    const acessoTotal = !!(superAdmin || (perfilAtual as any)?.acesso_total);
    if (!acessoTotal) {
      if (!perfilAtual?.grupo_id) throw new Error("Seu usuário não está vinculado a um grupo.");
      if (data.grupo_id !== perfilAtual.grupo_id) {
        throw new Error("Você só pode cadastrar corretores no seu grupo.");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Empresa: a de quem cadastra. O grupo tem que ser dela (M2). Só o super admin escolhe outra.
    let empresaId: string | null = perfilAtual?.empresa_id ?? null;
    if (data.grupo_id) {
      const { data: grupo } = await supabaseAdmin.from("grupos").select("empresa_id").eq("id", data.grupo_id).maybeSingle();
      if (!grupo) throw new Error("Grupo selecionado não foi encontrado.");
      if (!superAdmin && grupo.empresa_id !== empresaId) {
        throw new Error("Você só pode cadastrar corretores em grupos da sua empresa.");
      }
      empresaId = empresaId ?? grupo.empresa_id;
      if (superAdmin && empresaId !== grupo.empresa_id) empresaId = grupo.empresa_id;
    }
    if (!empresaId) throw new Error("Sua empresa não foi identificada.");

    const email = data.email.trim().toLowerCase();

    // O convite vai antes para o gatilho handle_new_user já criar o perfil com papel/empresa/grupo.
    const { data: convite } = await supabaseAdmin.from("convites_admin").insert({
      email,
      role: data.role,
      empresa_id: empresaId,
      grupo_id: data.grupo_id ?? null,
      nome: data.nome,
      criado_por: context.userId,
    }).select("id").maybeSingle();

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: gerarSenhaInterna(),   // ninguém conhece esta senha; a pessoa define a dela pelo link
      email_confirm: true,
      user_metadata: {
        invited_by_admin: true,
        nome: data.nome,
        role: data.role,
        grupo_id: data.grupo_id ?? null,
        empresa_id: empresaId,
      },
    });
    if (cErr || !created?.user) {
      // não deixa convite aberto para um e-mail que já existe
      if (convite?.id) await supabaseAdmin.from("convites_admin").update({ usado_em: new Date().toISOString() }).eq("id", convite.id);
      const msg = (cErr as any)?.code === "email_exists" || /already|registered|exists/i.test(cErr?.message ?? "")
        ? ERRO_JA_TEM_CONTA
        : cErr?.message || "Falha ao criar usuário";
      throw new Error(msg);
    }
    const userId = created.user.id;

    // Usuário recém-criado (não existia): pode gravar o perfil com segurança.
    await supabaseAdmin.from("perfis").upsert({
      id: userId,
      nome: data.nome,
      role: data.role,
      grupo_id: data.grupo_id ?? null,
      empresa_id: empresaId,
    }, { onConflict: "id" });

    let corretorId: string | null = null;
    if (data.role === "corretor") {
      const { data: novo, error: nErr } = await supabaseAdmin.from("corretores").insert({
        user_id: userId,
        nome: data.nome,
        telefone: data.telefone ?? null,
        grupo_id: data.grupo_id ?? null,
        empresa_id: empresaId,
        ativo: true,
        canal_notificacao: data.canal_notificacao,
        recebe_via_web: data.recebe_via_web,
        recebe_via_whatsapp: data.recebe_via_whatsapp,
      }).select("id").single();
      if (nErr) throw new Error(nErr.message);
      corretorId = novo.id;
      await supabaseAdmin.from("perfis").update({ corretor_id: corretorId }).eq("id", userId);
    }

    const link = await gerarLinkDefinirSenha(supabaseAdmin, email);
    return { ok: true, email, nome: data.nome, link, user_id: userId, corretor_id: corretorId };
  });

// Novo link para o corretor definir a senha (o admin repassa por WhatsApp). Não define nem devolve senha.
// Só para corretor/gerente da MESMA empresa; nunca para master, acesso total ou super admin.
export const redefinirSenhaCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    corretor_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilAtual } = await context.supabase
      .from("perfis").select("role, super_admin, acesso_total, empresa_id, grupo_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode redefinir senhas.");
    }
    const superAdmin = !!perfilAtual?.super_admin;
    const acessoTotal = !!(superAdmin || (perfilAtual as any)?.acesso_total);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: corr } = await supabaseAdmin
      .from("corretores").select("id, user_id, nome, empresa_id, grupo_id").eq("id", data.corretor_id).maybeSingle();
    if (!corr?.user_id) throw new Error("Corretor sem usuário vinculado. Use 'Cadastrar com senha'.");
    // acesso total vale dentro da própria empresa; atravessar empresas só o super admin
    if (!superAdmin && corr.empresa_id !== perfilAtual?.empresa_id) {
      throw new Error("Acesso negado: este corretor pertence a outra empresa.");
    }
    if (!acessoTotal && corr.grupo_id !== perfilAtual?.grupo_id) {
      throw new Error("Você só pode redefinir senhas de corretores do seu grupo.");
    }
    const { data: alvo } = await supabaseAdmin
      .from("perfis").select("role, super_admin, acesso_total, empresa_id").eq("id", corr.user_id).maybeSingle();
    if (!alvo || alvo.super_admin || alvo.acesso_total || !["corretor", "gerente"].includes(alvo.role)) {
      throw new Error("Esta conta não pode ter a senha redefinida por aqui.");
    }
    if (!superAdmin && alvo.empresa_id !== perfilAtual?.empresa_id) {
      throw new Error("Acesso negado: este usuário pertence a outra empresa.");
    }
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(corr.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("Usuário sem e-mail cadastrado.");
    const link = await gerarLinkDefinirSenha(supabaseAdmin, email);
    return { ok: true, email, nome: corr.nome, link };
  });





