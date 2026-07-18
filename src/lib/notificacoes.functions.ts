import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarNotificacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notificacoes")
      .select("id, tipo, titulo, descricao, lida, created_at, lead_id")
      .eq("destinatario_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const marcarNotificacaoLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", data.id)
      .eq("destinatario_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const marcarTodasLidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("destinatario_id", context.userId)
      .eq("lida", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registrarLoginCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("registrar_login_corretor");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
