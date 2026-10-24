import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { lerLeadEmail } from "@/lib/parse-lead-email";

// Recebe o e-mail de aviso de lead de um portal (ZAP, VivaReal, OLX...) já em JSON e cria o lead.
// Quem entrega o e-mail aqui é o n8n (ou um encaminhador de e-mail). O token da imobiliária vai
// no cabeçalho x-webhook-token, igual ao /api/public/webhook, e a distribuição é a mesma (rodízio).
const schema = z.object({
  de: z.string().max(300).default(""),
  assunto: z.string().max(500).default(""),
  texto: z.string().min(1).max(200_000),
  grupo_id: z.string().uuid().optional(),
});

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/lead-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-webhook-token") ?? "";
        if (!token) return json({ error: "unauthorized" }, 401);
        const corpo = schema.safeParse(await request.json().catch(() => null));
        if (!corpo.success) return json({ error: "corpo inválido" }, 400);

        const lead = lerLeadEmail(corpo.data.de, corpo.data.assunto, corpo.data.texto);
        if (!lead.nome || (!lead.telefone && !lead.email)) {
          return json({ ok: false, ignorado: true, motivo: "e-mail sem nome e contato (não parece aviso de lead)" });
        }

        const obs = [
          lead.portal ? `Portal: ${lead.portal}` : null,
          lead.anuncio ? `Anúncio: ${lead.anuncio}` : null,
          lead.mensagem,
        ].filter(Boolean).join("\n");

        // Reaproveita o webhook: mesma validação de token, teste liberado, dedup e rodízio.
        const url = new URL("/api/public/webhook", request.url);
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-webhook-token": token },
          body: JSON.stringify({
            nome: lead.nome,
            telefone: lead.telefone,
            email: lead.email,
            observacoes: obs || undefined,
            grupo_id: corpo.data.grupo_id,
          }),
        });
        const saida = await r.json().catch(() => ({}));
        return json({ ...saida, portal: lead.portal, lido: { nome: lead.nome, telefone: !!lead.telefone, email: !!lead.email } }, r.status);
      },
    },
  },
});
