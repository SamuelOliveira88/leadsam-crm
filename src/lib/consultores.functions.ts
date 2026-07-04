import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ConsultorInput = z.object({
  nome: z.string().min(1).max(120),
  numero_whatsapp: z.string().min(10).max(20),
  ativo: z.boolean().default(true),
  ordem_rodizio: z.number().int().min(0).default(0),
});

const ConsultorComContaInput = ConsultorInput.extend({
  email: z.string().email(),
  senha: z.string().min(6).max(72),
});

async function assertAdmin(claims: { email?: string }) {
  const email = (claims.email || "").toLowerCase();
  if (email !== "samuelrodrigodeoliveira@gmail.com") {
    throw new Error("Acesso negado");
  }
}

export const criarConsultorComConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConsultorComContaInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.claims as { email?: string });
    const { count } = await context.supabase.from("consultores").select("*", { count: "exact", head: true });
    if ((count ?? 0) >= 10) throw new Error("Limite de 10 consultores atingido");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { full_name: data.nome },
    });
    if (authErr || !created.user) throw new Error(authErr?.message ?? "Falha ao criar usuário");

    const { data: row, error } = await context.supabase
      .from("consultores")
      .insert({
        nome: data.nome,
        numero_whatsapp: data.numero_whatsapp,
        ativo: data.ativo,
        ordem_rodizio: data.ordem_rodizio,
        user_id: created.user.id,
      })
      .select()
      .single();
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(error.message);
    }
    return row;
  });

export const listarConsultores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.claims as { email?: string });
    const { data, error } = await context.supabase
      .from("consultores")
      .select("*")
      .order("ordem_rodizio", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listarConsultoresPublicos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("consultores")
      .select("id, nome, numero_whatsapp, ativo")
      .eq("ativo", true)
      .order("ordem_rodizio", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarConsultor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConsultorInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.claims as { email?: string });
    const { count } = await context.supabase.from("consultores").select("*", { count: "exact", head: true });
    if ((count ?? 0) >= 10) throw new Error("Limite de 10 consultores atingido");
    const { data: row, error } = await context.supabase.from("consultores").insert(data).select().single();
    if (error) {
      if (error.message.toLowerCase().includes("limite")) throw new Error("Limite de 10 consultores atingido");
      throw new Error(error.message);
    }
    return row;
  });

export const atualizarConsultor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: ConsultorInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.claims as { email?: string });
    const { data: row, error } = await context.supabase
      .from("consultores")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const excluirConsultor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.claims as { email?: string });
    const { error } = await context.supabase.from("consultores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
