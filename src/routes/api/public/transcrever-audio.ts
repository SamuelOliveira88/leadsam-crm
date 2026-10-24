import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Transcreve o áudio de um cliente (chamado pelo n8n do número mãe).
//  POST { segredo, mimetype, base64 }  ->  { texto }
// O segredo é o mesmo do número mãe (numero_mae_config). Sem segredo válido: 401.
// Usa a mesma GEMINI_API_KEY da mensagem de abertura.

const cabecalhos = { "content-type": "application/json", "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cabecalhos });

const schema = z.object({
  segredo: z.string().min(24).max(200),
  mimetype: z.string().min(3).max(100).default("audio/ogg"),
  // ~10 MB de áudio em base64: de sobra para uma mensagem de voz do WhatsApp.
  base64: z.string().min(100).max(14_000_000),
});

export const Route = createFileRoute("/api/public/transcrever-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corpo = await request.json().catch(() => null);
        const parsed = schema.safeParse(corpo);
        if (!parsed.success) return json({ error: "corpo inválido" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok } = await (supabaseAdmin as any).rpc("numero_mae_segredo_ok", {
          p_segredo: parsed.data.segredo,
        });
        if (ok !== true) return json({ error: "unauthorized" }, 401);

        const key = process.env.GEMINI_API_KEY;
        if (!key) return json({ error: "IA não configurada" }, 503);

        // "audio/ogg; codecs=opus" -> "audio/ogg"
        const mime = parsed.data.mimetype.split(";")[0].trim() || "audio/ogg";
        const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        "Transcreva este áudio de WhatsApp em português do Brasil, fielmente. " +
                        "Responda APENAS com o texto falado, sem aspas, sem introdução. " +
                        "Se não houver fala compreensível, responda exatamente: (áudio sem fala)",
                    },
                    { inline_data: { mime_type: mime, data: parsed.data.base64 } },
                  ],
                },
              ],
            }),
          },
        );
        if (!res.ok) return json({ error: `IA falhou (${res.status})` }, 502);
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const texto = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (!texto) return json({ error: "sem texto" }, 502);
        return json({ texto: texto.slice(0, 4000) });
      },
    },
  },
});
