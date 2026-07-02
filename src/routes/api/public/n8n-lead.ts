import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sanitizePhone } from "@/lib/formatters";

const Payload = z.object({
  numero: z.string().min(8),
  resposta: z.string().min(1),
});

export const Route = createFileRoute("/api/public/n8n-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try { raw = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
        const parsed = Payload.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "Campos 'numero' e 'resposta' são obrigatórios" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Chama a função de rodízio atômica
        const { data: proximo, error: rodizioError } = await supabaseAdmin.rpc("escolher_proximo_consultor");
        if (rodizioError) return Response.json({ error: rodizioError.message }, { status: 500 });
        if (!proximo || !proximo.id) return Response.json({ error: "Nenhum consultor ativo cadastrado" }, { status: 503 });

        const telefone = sanitizePhone(parsed.data.numero);
        const nome = `Lead WhatsApp ${telefone.slice(-4)}`;

        const { error: leadError } = await supabaseAdmin.from("leads").insert({
          nome,
          telefone,
          origem: "WhatsApp Bot",
          interesse: parsed.data.resposta,
          notas: parsed.data.resposta,
          consultor_id: proximo.id,
        });
        if (leadError) return Response.json({ error: leadError.message }, { status: 500 });

        return Response.json({
          consultor_nome: proximo.nome,
          consultor_numero: proximo.numero_whatsapp,
        });
      },
    },
  },
});
