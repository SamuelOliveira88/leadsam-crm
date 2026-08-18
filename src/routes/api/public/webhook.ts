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
          const aceitos = [
            process.env.WEBHOOK_LEAD_TOKEN,
            process.env.WEBHOOK_LEAD_TOKEN_LP,
            process.env.WEBHOOK_LEAD_TOKEN_NOTIF,
            process.env.WEBHOOK_LEAD_TOKEN_SAMUELIMOB,
          ].filter((t): t is string => !!t);
          if (!token || !aceitos.includes(token)) {
            return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
          }
          const origemToken =
            token === process.env.WEBHOOK_LEAD_TOKEN_LP
              ? "landing"
              : token === process.env.WEBHOOK_LEAD_TOKEN_NOTIF
                ? "notificacoes"
                : token === process.env.WEBHOOK_LEAD_TOKEN_SAMUELIMOB
                  ? "samuelimob"
                  : "webhook";



          const grupoFromQs = url.searchParams.get("grupo_id");
          const body = await request.json().catch(() => ({}));


          let nome = body.nome || body.name || body.full_name;
          let telefone = body.telefone || body.phone_number || body.phone;
          let email = body.email;
          let grupo_id = body.grupo_id || grupoFromQs;
          let observacoes = body.mensagem || body.resumo || body.observacoes || body.message || body.notes;

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

          // Deduplicação: mesmo telefone no mesmo grupo nos últimos 10 minutos -> ignora
          if (telefone) {
            const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: dup } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("grupo_id", grupo_id)
              .eq("telefone", telefone)
              .gte("created_at", since)
              .limit(1)
              .maybeSingle();
            if (dup?.id) {
              return new Response(JSON.stringify({ ok: true, deduped: true, lead_id: dup.id }), {
                headers: { "content-type": "application/json" },
              });
            }
          }

          const { data, error } = await supabaseAdmin.rpc("distribuir_lead_round_robin", {
            p_nome: nome, p_telefone: telefone ?? null, p_email: email ?? null, p_grupo_id: grupo_id,
            p_extra: { fonte: origemToken, ...(observacoes ? { observacoes } : {}) },
          });
          if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

          const corretorId = data as string | null;

          // Só notifica quando o lead foi efetivamente distribuído (não represado).
          if (corretorId) {
            const { notificarMonitor, notificarCorretorPorLead } = await import("@/lib/evolution.server");
            const { data: grupoRow } = await supabaseAdmin.from("grupos").select("nome").eq("id", grupo_id).maybeSingle();
            

            try {
              const { data: leadRow } = await supabaseAdmin
                .from("leads")
                .select("id, corretores(nome)")
                .eq("grupo_id", grupo_id)
                .eq("nome", nome)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (leadRow?.id) {
                const envio = await notificarCorretorPorLead(supabaseAdmin, leadRow.id);
                if (!envio.ok) console.error("[webhook] falha Evolution", envio.error);
              }
              await notificarMonitor(
                "entrega",
                { nome, telefone, email, grupo: grupoRow?.nome ?? null, fonte: origemToken },
                (leadRow as any)?.corretores?.nome ?? null,
              );
            } catch (e) { console.error("[webhook] falha notificando corretor", e); }
          }


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
