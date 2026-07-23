import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { processarNotificacoesWhatsAppPendentes } from "@/lib/evolution.server";

export const Route = createFileRoute("/api/public/hooks/processar-fila")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
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
          return new Response(
            JSON.stringify({ ok: true, ...resultado }),
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
