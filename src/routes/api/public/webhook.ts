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
          // O token só vale no cabeçalho x-webhook-token. Token na URL não é mais aceito
          // (URLs ficam gravadas em logs e históricos).
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { resolverEmpresaPorToken, tokenDoCabecalho } = await import("@/lib/empresa-token.server");
          const token = tokenDoCabecalho(request);
          const acesso = await resolverEmpresaPorToken(supabaseAdmin, token, ["samuelimob", "webhook", "landing", "notificacoes"]);
          if (!acesso) return json({ error: "unauthorized" }, 401);
          const origemToken = acesso.origem;




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

          // O grupo precisa pertencer à empresa dona do token.
          const { data: grupoRow } = await supabaseAdmin
            .from("grupos").select("id, nome, empresa_id").eq("id", grupo_id).maybeSingle();
          if (!grupoRow || grupoRow.empresa_id !== acesso.empresa_id) {
            return json({ error: "grupo_id não pertence à empresa deste token" }, 403);
          }

          // Deduplicação: mesmo telefone na mesma empresa nos últimos 30 dias não cria outro lead.
          // Atualiza o existente, registra a entrada nas notas e avisa o corretor que já o atende.
          if (telefone) {
            const { buscarLeadDuplicado, registrarReentrada } = await import("@/lib/lead-dedup.server");
            const existente = await buscarLeadDuplicado(supabaseAdmin, acesso.empresa_id, telefone);
            if (existente) {
              await registrarReentrada(supabaseAdmin, existente, acesso.empresa_id, {
                nome, email, observacoes, fonte: origemToken,
              });
              let notificado = false;
              if (existente.corretor_id) {
                try {
                  const { notificarCorretorLeadRepetido } = await import("@/lib/evolution.server");
                  const envio = await notificarCorretorLeadRepetido(supabaseAdmin, existente.id, observacoes);
                  notificado = envio.ok;
                  if (!envio.ok) console.error("[webhook] aviso de lead repetido não enviado:", envio.error);
                } catch (e) { console.error("[webhook] falha avisando corretor do lead repetido", e); }
              }
              return json({ ok: true, deduped: true, lead_id: existente.id, corretor_id: existente.corretor_id, notificado });
            }
          }

          const { data, error } = await supabaseAdmin.rpc("distribuir_lead_rr", {
            p_nome: nome, p_telefone: telefone ?? null, p_email: email ?? null, p_grupo_id: grupo_id,
            p_extra: { fonte: origemToken, ...(observacoes ? { observacoes } : {}) },
          });
          if (error) return json({ error: error.message }, 500);

          const resultado = (data ?? {}) as { lead_id?: string; corretor_id?: string | null };
          const leadId = resultado.lead_id ?? null;
          const corretorId = resultado.corretor_id ?? null;

          // Só notifica quando o lead foi efetivamente distribuído (não represado).
          if (corretorId && leadId) {
            const { notificarMonitor, notificarCorretorPorLead } = await import("@/lib/evolution.server");
            try {
              const envio = await notificarCorretorPorLead(supabaseAdmin, leadId);
              if (!envio.ok) console.error("[webhook] falha Evolution", envio.error);
              const { data: corr } = await supabaseAdmin.from("corretores").select("nome").eq("id", corretorId).maybeSingle();
              await notificarMonitor(
                "entrega",
                { nome, telefone, email, grupo: grupoRow.nome ?? null, fonte: origemToken },
                corr?.nome ?? null,
              );
            } catch (e) { console.error("[webhook] falha notificando corretor", e); }
          }

          return json({ ok: true, lead_id: leadId, corretor_id: corretorId });

        } catch (e: any) {
          return json({ error: e.message }, 500);
        }
      },
      GET: async ({ request }) => {
        // Verificação do webhook do Facebook: só devolve o challenge se o verify_token conferir.
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const challenge = url.searchParams.get("hub.challenge");
        const verifyToken = url.searchParams.get("hub.verify_token");

        if (mode || challenge || verifyToken) {
          const negado = () => new Response("forbidden", { status: 403, headers: CORS });
          if (mode !== "subscribe" || !challenge || !verifyToken) return negado();

          const { iguaisSeguro, resolverEmpresaPorToken } = await import("@/lib/empresa-token.server");
          const esperado = process.env.FACEBOOK_VERIFY_TOKEN;
          let ok = !!esperado && iguaisSeguro(verifyToken, esperado);
          if (!ok) {
            // Também aceita um token ativo da tabela webhook_tokens como verify_token.
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            ok = !!(await resolverEmpresaPorToken(supabaseAdmin, verifyToken, ["samuelimob", "webhook", "landing", "notificacoes"]));
          }
          if (!ok) return negado();
          return new Response(challenge, { headers: CORS });
        }
        return new Response("ok", { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
