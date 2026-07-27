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

    // 2) Envia convite por e-mail com metadados que ligam a conta ao corretor
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      .from("perfis").select("role, super_admin, empresa_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode reenviar convites.");
    }

    let query = context.supabase
      .from("perfis")
      .select("id, nome, role, grupo_id, empresa_id")
      .in("role", ["corretor", "gerente"]);
    if (data.grupo_id) query = query.eq("grupo_id", data.grupo_id);
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

function gerarSenhaForte(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums  = "23456789";
  const sym   = "@#$%&*!?";
  const all = upper + lower + nums + sym;
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = rand(upper) + rand(lower) + rand(nums) + rand(sym);
  for (let i = 0; i < 8; i++) out += rand(all);
  return out.split("").sort(() => Math.random() - 0.5).join("");
}

// Cadastra corretor direto (sem e-mail): cria/atualiza o usuário no Auth com a senha
// definida pelo admin. Retorna a senha em texto claro para o admin repassar por WhatsApp.
export const cadastrarCorretorComSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    nome: z.string().min(1),
    email: z.string().email(),
    telefone: z.string().optional().nullable(),
    grupo_id: z.string().uuid().nullable().optional(),
    canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
    recebe_via_web: z.boolean().default(true),
    recebe_via_whatsapp: z.boolean().default(true),
    role: z.enum(["corretor", "gerente"]).default("corretor"),
    senha: z.string().min(8).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilAtual } = await context.supabase
      .from("perfis").select("role, super_admin, empresa_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode cadastrar corretores.");
    }

    const email = data.email.trim().toLowerCase();
    const senha = data.senha ?? gerarSenhaForte();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    // Busca por email no Auth e só permite reutilizar se pertencer à mesma empresa do admin.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existente = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existente) {
      const { data: perfilExistente } = await supabaseAdmin
        .from("perfis").select("empresa_id").eq("id", existente.id).maybeSingle();
      if (!perfilAtual?.super_admin && perfilExistente?.empresa_id && perfilExistente.empresa_id !== perfilAtual?.empresa_id) {
        throw new Error("Este e-mail já pertence a um usuário de outra empresa. Use outro endereço.");
      }
      userId = existente.id;
      const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: senha,
        email_confirm: true,
        user_metadata: {
          ...(existente.user_metadata ?? {}),
          invited_by_admin: true,
          nome: data.nome,
          role: data.role,
          grupo_id: data.grupo_id ?? null,
          empresa_id: perfilAtual?.empresa_id ?? null,
        },
      });
      if (uErr) throw new Error(uErr.message);
    } else {

      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          invited_by_admin: true,
          nome: data.nome,
          role: data.role,
          grupo_id: data.grupo_id ?? null,
          empresa_id: perfilAtual?.empresa_id ?? null,
        },
      });
      if (cErr || !created?.user) throw new Error(cErr?.message || "Falha ao criar usuário");
      userId = created.user.id;
    }


    await supabaseAdmin.from("perfis").upsert({
      id: userId,
      nome: data.nome,
      role: data.role,
      grupo_id: data.grupo_id ?? null,
      empresa_id: perfilAtual?.empresa_id ?? null,
    }, { onConflict: "id" });

    let corretorId: string | null = null;
    if (data.role === "corretor") {
      const { data: existeCorr } = await supabaseAdmin
        .from("corretores").select("id").eq("user_id", userId).maybeSingle();
      if (existeCorr?.id) {
        corretorId = existeCorr.id;
        await supabaseAdmin.from("corretores").update({
          nome: data.nome,
          telefone: data.telefone ?? null,
          grupo_id: data.grupo_id ?? null,
          empresa_id: perfilAtual?.empresa_id ?? null,
          canal_notificacao: data.canal_notificacao,
          recebe_via_web: data.recebe_via_web,
          recebe_via_whatsapp: data.recebe_via_whatsapp,
          ativo: true,
        }).eq("id", existeCorr.id);
      } else {
        const { data: novo, error: nErr } = await supabaseAdmin.from("corretores").insert({
          user_id: userId,
          nome: data.nome,
          telefone: data.telefone ?? null,
          grupo_id: data.grupo_id ?? null,
          empresa_id: perfilAtual?.empresa_id ?? null,
          ativo: true,
          canal_notificacao: data.canal_notificacao,
          recebe_via_web: data.recebe_via_web,
          recebe_via_whatsapp: data.recebe_via_whatsapp,
        }).select("id").single();
        if (nErr) throw new Error(nErr.message);
        corretorId = novo.id;
      }
      await supabaseAdmin.from("perfis").update({ corretor_id: corretorId }).eq("id", userId);
    }

    return { ok: true, email, senha, user_id: userId, corretor_id: corretorId };
  });

// Redefine a senha de um corretor já existente (para o admin repassar por WhatsApp)
export const redefinirSenhaCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    corretor_id: z.string().uuid(),
    senha: z.string().min(8).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilAtual } = await context.supabase
      .from("perfis").select("role, super_admin, empresa_id").eq("id", context.userId).maybeSingle();
    if (!(perfilAtual?.super_admin || perfilAtual?.role === "master")) {
      throw new Error("Apenas o administrador pode redefinir senhas.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: corr } = await supabaseAdmin
      .from("corretores").select("id, user_id, nome, empresa_id").eq("id", data.corretor_id).maybeSingle();
    if (!corr?.user_id) throw new Error("Corretor sem usuário vinculado. Use 'Cadastrar com senha'.");
    if (!perfilAtual?.super_admin && corr.empresa_id !== perfilAtual?.empresa_id) {
      throw new Error("Acesso negado: este corretor pertence a outra empresa.");
    }

    const senha = data.senha ?? gerarSenhaForte();
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(corr.user_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(corr.user_id, {
      password: senha,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true, email: u?.user?.email ?? null, nome: corr.nome, senha };
  });





