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

export const notificarLoginMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        posicao: z
          .object({
            latitude: z.number().finite().min(-90).max(90),
            longitude: z.number().finite().min(-180).max(180),
            precisaoMetros: z.number().finite().min(0).max(100000).optional().nullable(),
          })
          .optional()
          .nullable(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      const { data: perfil } = await context.supabase
        .from("perfis")
        .select("nome, role")
        .eq("id", context.userId)
        .maybeSingle();
      const { data: userRes } = await context.supabase.auth.getUser();
      const email = userRes?.user?.email ?? "(sem email)";
      const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
      const numero = process.env.MONITOR_WHATSAPP;
      if (!numero) return { ok: true, skipped: true };
      const linhas = [
        "🔐 *Login no Alexandria Leds*",
        `Nome: ${perfil?.nome ?? "(sem nome)"}`,
        `Email: ${email}`,
        `Perfil: ${perfil?.role ?? "-"}`,
        `Quando: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      ];
      // Localização do login: registra no banco e informa o monitor (não bloqueia o login).
      const pos = data?.posicao;
      if (pos) {
        const { data: r } = await context.supabase.rpc("registrar_checkin", {
          p_tipo: "login",
          p_latitude: pos.latitude,
          p_longitude: pos.longitude,
          p_precisao_metros: pos.precisaoMetros ?? undefined,
        });
        const reg = r as any;
        const { linkMapa, textoDistancia } = await import("@/lib/checkin.functions");
        if (reg?.local_nome) {
          linhas.push(`📍 ${reg.dentro ? "No local" : "FORA do local"}: ${reg.local_nome} (${textoDistancia(reg.distancia_metros)})`);
        } else {
          linhas.push("📍 Localização registrada (nenhum local de plantão cadastrado)");
        }
        linhas.push(`Mapa: ${linkMapa(pos.latitude, pos.longitude)}`);
      } else {
        linhas.push("📍 Localização: não informada");
      }
      await sendWhatsAppNotification(numero, linhas.join("\n"));
      return { ok: true };
    } catch (e) {
      console.error("[notificarLoginMonitor]", e);
      return { ok: false };
    }
  });
