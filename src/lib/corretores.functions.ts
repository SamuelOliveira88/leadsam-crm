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


