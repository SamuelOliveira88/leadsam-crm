import { createFileRoute } from "@tanstack/react-router";

// Webhook público — aceita { nome, telefone, email, grupo_id } ou payload Facebook Lead Ads.
// Distribui via rodízio no grupo indicado.
export const Route = createFileRoute("/api/public/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = url.searchParams.get("token") || request.headers.get("x-webhook-token");
          const expected = process.env.WEBHOOK_LEAD_TOKEN;
          if (!expected || token !== expected) {
            return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
          }
          const grupoFromQs = url.searchParams.get("grupo_id");
          const body = await request.json().catch(() => ({}));


          let nome = body.nome || body.name || body.full_name;
          let telefone = body.telefone || body.phone_number || body.phone;
          let email = body.email;
          let grupo_id = body.grupo_id || grupoFromQs;

          // Facebook lead ads payload
          if (!nome && Array.isArray(body.field_data)) {
            for (const f of body.field_data) {
              const key = String(f.name || "").toLowerCase();
              const val = Array.isArray(f.values) ? f.values[0] : f.values;
              if (key.includes("name") && !nome) nome = val;
              if ((key.includes("phone") || key.includes("tel")) && !telefone) telefone = val;
              if (key.includes("email") && !email) email = val;
            }
          }

          if (!nome || !grupo_id) {
            return new Response(JSON.stringify({ error: "nome e grupo_id são obrigatórios" }), { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("distribuir_lead_round_robin", {
            p_nome: nome, p_telefone: telefone ?? null, p_email: email ?? null, p_grupo_id: grupo_id,
          });
          if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
          return new Response(JSON.stringify({ ok: true, corretor_id: data }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
      },
      GET: async ({ request }) => {
        // Facebook webhook verification
        const url = new URL(request.url);
        const challenge = url.searchParams.get("hub.challenge");
        if (challenge) return new Response(challenge);
        return new Response("ok");
      },
    },
  },
});
