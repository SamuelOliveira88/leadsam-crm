import { createFileRoute } from "@tanstack/react-router";

// Cabeçalhos CORS — permite que landing pages externas enviem o formulário via browser.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-webhook-token",
  "access-control-max-age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

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
            return json({ error: "unauthorized" }, 401);
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
          if (body.empreendimento) {
            observacoes = observacoes
              ? `Empreendimento: ${body.empreendimento}\n${observacoes}`
              : `Empreendimento: ${body.empreendimento}`;
          }

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

          // Google Ads Lead Form webhook payload
          // https://developers.google.com/google-ads/webservice/lead-form-webhook
          if (!nome && Array.isArray(body.user_column_data)) {
            // Verificação opcional da chave de segurança configurada no Google Ads.
            const googleKeyEsperado = process.env.GOOGLE_ADS_WEBHOOK_KEY;
            if (googleKeyEsperado && body.google_key !== googleKeyEsperado) {
              return json({ error: "google_key inválida" }, 401);
            }

            for (const f of body.user_column_data) {
              const columnId = String(f.column_id || f.column_name || "").toUpperCase();
              const val = f.string_value;
              if (!val) continue;
              if (columnId.includes("FULL_NAME") && !nome) nome = val;
              if (columnId.includes("PHONE") && !telefone) telefone = val;
              if (columnId.includes("EMAIL") && !email) email = val;
            }

            // Testes enviados pelo Google Ads (is_test: true) não devem virar leads reais.
            if (body.is_test) {
              return json({ ok: true, test: true });
            }
          }

          if (!nome || !grupo_id) {
            return json({ error: "nome e grupo_id são obrigatórios" }, 400);
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
              return json({ ok: true, deduped: true, lead_id: dup.id });
            }
          }

          const { data, error } = await supabaseAdmin.rpc("distribuir_lead_round_robin", {
            p_nome: nome, p_telefone: telefone ?? null, p_email: email ?? null, p_grupo_id: grupo_id,
            p_extra: { fonte: origemToken, ...(observacoes ? { observacoes } : {}) },
          });
          if (error) return json({ error: error.message }, 500);

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


          return json({ ok: true, corretor_id: data });

        } catch (e: any) {
          return json({ error: e.message }, 500);
        }
      },
      GET: async ({ request }) => {
        // Facebook webhook verification
        const url = new URL(request.url);
        const challenge = url.searchParams.get("hub.challenge");
        if (challenge) return new Response(challenge, { headers: CORS });
        return new Response("ok", { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
