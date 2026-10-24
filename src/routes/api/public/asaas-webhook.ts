import { createFileRoute } from "@tanstack/react-router";

// Aviso do Asaas quando um pagamento é confirmado. Cadastre no Asaas (Integrações > Webhooks):
//   URL: https://www.alexandrialeads.app/api/public/asaas-webhook
//   Token de autenticação: o mesmo valor de ASAAS_WEBHOOK_TOKEN na Vercel. Eventos: pagamentos.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const REF = /^alex\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|(alexandria)$/i;

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
        if (!esperado) return json({ error: "webhook não configurado" }, 503);
        const { iguaisSeguro } = await import("@/lib/empresa-token.server");
        if (!iguaisSeguro(request.headers.get("asaas-access-token") ?? "", esperado)) return json({ error: "unauthorized" }, 401);

        const corpo: any = await request.json().catch(() => null);
        const evento = String(corpo?.event ?? "");
        const pg = corpo?.payment;
        if (!pg?.id || !["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(evento)) return json({ ok: true, ignorado: true });

        const m = REF.exec(String(pg.externalReference ?? ""));
        if (!m) return json({ ok: true, ignorado: "sem referência do Alexandria" });
        const [, empresaId, plano] = m;

        const estender = true; // cada mensalidade paga estende 31 dias

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).rpc("ativar_plano", {
          p_empresa: empresaId.toLowerCase(), p_plano: plano, p_valor: Number(pg.value ?? 0),
          p_asaas_id: String(pg.id), p_evento: evento, p_estender: estender,
        });
        if (error) { console.error("[asaas-webhook] ativar_plano", error.message); return json({ error: "falha ao ativar" }, 500); }

        if (data === true) {
          try {
            const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
            const { data: emp } = await (supabaseAdmin as any).from("empresas").select("nome").eq("id", empresaId).maybeSingle();
            await sendWhatsAppNotification("5511932368278",
              `💰 *Pagamento confirmado no Alexandria*\nImobiliária: ${emp?.nome ?? empresaId}\nPlano: Alexandria (mensal)\nValor: R$ ${Number(pg.value ?? 0).toFixed(2).replace(".", ",")}`);
          } catch { /* aviso é só conforto */ }
        }
        return json({ ok: true, ativado: data === true });
      },
    },
  },
});
