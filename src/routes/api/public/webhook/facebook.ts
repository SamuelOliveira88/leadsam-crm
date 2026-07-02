import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sanitizePhone } from "@/lib/formatters";

// Aceita payload nativo do Facebook Lead Ads OU JSON simples { name, phone, interest }
export const Route = createFileRoute("/api/public/webhook/facebook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Facebook verifica webhooks com um GET usando hub.challenge
        const url = new URL(request.url);
        const challenge = url.searchParams.get("hub.challenge");
        if (challenge) return new Response(challenge, { status: 200 });
        return new Response("ok", { status: 200 });
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const brokerName = (url.searchParams.get("broker") || "").trim();
        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }

        // Extração
        let nome = "";
        let telefone = "";
        let interesse: string | null = null;

        const simples = z.object({
          name: z.string().optional(),
          nome: z.string().optional(),
          phone: z.string().optional(),
          telefone: z.string().optional(),
          interest: z.string().optional(),
          interesse: z.string().optional(),
        }).safeParse(body);

        if (simples.success && (simples.data.name || simples.data.nome) && (simples.data.phone || simples.data.telefone)) {
          nome = simples.data.name || simples.data.nome || "";
          telefone = simples.data.phone || simples.data.telefone || "";
          interesse = simples.data.interest || simples.data.interesse || null;
        } else {
          // Formato Facebook Lead Ads: { entry: [{ changes: [{ value: { field_data: [{name, values:[...]}] } }] }] }
          try {
            const b = body as { entry?: Array<{ changes?: Array<{ value?: { field_data?: Array<{ name: string; values: string[] }> } }> }> };
            const fields = b.entry?.[0]?.changes?.[0]?.value?.field_data ?? [];
            for (const f of fields) {
              const key = f.name.toLowerCase();
              const val = f.values?.[0] ?? "";
              if (!nome && (key.includes("name") || key.includes("nome"))) nome = val;
              else if (!telefone && (key.includes("phone") || key.includes("telefone"))) telefone = val;
              else if (!interesse && (key.includes("interest") || key.includes("interesse") || key.includes("message"))) interesse = val;
            }
          } catch { /* noop */ }
        }

        if (!nome || !telefone) return Response.json({ error: "Campos nome e telefone são obrigatórios" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let consultorId: string | null = null;
        if (brokerName) {
          const { data: c } = await supabaseAdmin
            .from("consultores")
            .select("id")
            .ilike("nome", brokerName)
            .limit(1)
            .maybeSingle();
          consultorId = c?.id ?? null;
        }

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            nome,
            telefone: sanitizePhone(telefone),
            origem: "Facebook Lead Ads",
            interesse,
            consultor_id: consultorId,
          })
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, lead_id: lead.id, consultor_id: consultorId }, { status: 200 });
      },
    },
  },
});
