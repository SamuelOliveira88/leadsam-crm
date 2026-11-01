import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { processarLembretesDeCompromisso, processarNotificacoesWhatsAppPendentes } from "@/lib/evolution.server";

export const Route = createFileRoute("/api/public/hooks/processar-fila")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        // Chamado pelo pg_cron do Supabase (job process-whatsapp-queue). O token vem SÓ no cabeçalho
        // x-webhook-token (na URL ficaria gravado em log). Vale CRON_TOKEN; WEBHOOK_LEAD_TOKEN fica
        // aceito só enquanto o Vault do banco ainda tiver o segredo antigo 'webhook_lead_token'.
        const { iguaisSeguro } = await import("@/lib/empresa-token.server");
        const token = request.headers.get("x-webhook-token") ?? "";
        const aceitos = [process.env.CRON_TOKEN, process.env.WEBHOOK_LEAD_TOKEN].filter((t): t is string => !!t && t.length >= 16);
        if (!token || !aceitos.some((t) => iguaisSeguro(token, t))) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 100);

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!supabaseUrl || !serviceKey) {
          return new Response(JSON.stringify({ error: "Config ausente" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        try {
          const resultado = await processarNotificacoesWhatsAppPendentes(supabase, limit);
          // Lembretes de visita (1 h antes). Se falhar, não derruba o envio dos avisos de lead.
          let lembretes: unknown = null;
          try {
            lembretes = await processarLembretesDeCompromisso(supabase, limit);
          } catch (e: any) {
            lembretes = { erro: e?.message ?? "erro nos lembretes" };
            console.error("[processar-fila] lembretes", e);
          }
          return new Response(
            JSON.stringify({ ok: true, ...resultado, lembretes }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "erro" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
