import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MIA_ALEXANDRIA_PROMPT } from "@/lib/mia-alexandria.conhecimento";

// Chat da Mi.IA na página de vendas do Alexandria.
//  POST { mensagens: [{ papel: "visitante"|"mia", texto }] }          -> { resposta }
//  POST { acao: "lead", nome, whatsapp }                               -> { ok }  (avisa o dono no WhatsApp)
// Sem login (é página pública): limite por IP, tamanho máximo e só o texto da conversa vai para a IA.

const cab = { "content-type": "application/json", "cache-control": "no-store" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cab });

const DONO_WHATSAPP = "5511932368278";

// Limite simples em memória (por instância do servidor). Basta para frear abuso comum.
const usos = new Map<string, number[]>();
function passou(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const lista = (usos.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) { usos.set(chave, lista); return false; }
  lista.push(agora); usos.set(chave, lista);
  if (usos.size > 5000) usos.clear();
  return true;
}
const ipDe = (r: Request) => (r.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";

const chatSchema = z.object({
  mensagens: z
    .array(z.object({ papel: z.enum(["visitante", "mia"]), texto: z.string().min(1).max(700) }))
    .min(1)
    .max(30),
});
const leadSchema = z.object({
  acao: z.literal("lead"),
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().min(10).max(20),
});

export const Route = createFileRoute("/api/public/chat-mia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = ipDe(request);
        const corpo = await request.json().catch(() => null);

        const lead = leadSchema.safeParse(corpo);
        if (lead.success) {
          if (!passou("lead:" + ip, 3, 3_600_000)) return json({ error: "muitas tentativas" }, 429);
          const digitos = lead.data.whatsapp.replace(/\D/g, "");
          if (digitos.length < 10 || digitos.length > 13) return json({ error: "WhatsApp inválido" }, 400);
          if (!passou("tel:" + digitos, 2, 86_400_000)) return json({ error: "este número já recebeu convite hoje" }, 429);
          const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Convite do teste de 7 dias. Teto de 30 convites automáticos por dia para ninguém encher o banco.
          let codigo: string | null = null;
          const desde = new Date(Date.now() - 86_400_000).toISOString();
          const { count } = await (supabaseAdmin as any)
            .from("convites_codigo").select("codigo", { count: "exact", head: true })
            .is("criado_por", null).gte("created_at", desde);
          if ((count ?? 0) < 30) {
            const letras = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
            for (let i = 0; i < 5 && !codigo; i++) {
              const bytes = crypto.getRandomValues(new Uint8Array(8));
              const c = Array.from(bytes, (b) => letras[b % letras.length]).join("");
              const { error } = await (supabaseAdmin as any).from("convites_codigo").insert({
                codigo: c, criado_por: null, expira_em: new Date(Date.now() + 7 * 86_400_000).toISOString(),
              });
              if (!error) codigo = c;
            }
          }
          const link = codigo ? `https://www.alexandrialeads.app/cadastro-empresa?codigo=${codigo}` : null;

          const avisoDono = await sendWhatsAppNotification(
            DONO_WHATSAPP,
            `🔔 *Interesse no Alexandria (página de vendas)*\nNome: ${lead.data.nome}\nWhatsApp: ${digitos}\n${codigo ? `Convite enviado: ${codigo}` : "Convite NÃO gerado (limite do dia). Chamar manualmente."}`,
          );
          let enviado = false;
          if (link) {
            const primeiro = lead.data.nome.split(/\s+/)[0];
            const r = await sendWhatsAppNotification(
              digitos.length <= 11 ? "55" + digitos : digitos,
              `Oi, ${primeiro}! Aqui é a Mi.IA do Alexandria Leads 👋\n\nSeu convite para testar *7 dias grátis*:\n${link}\n\nÉ só abrir, criar sua conta e dar o nome da sua imobiliária. O código do convite é *${codigo}* (vale por 7 dias). Qualquer dúvida, é só responder aqui.`,
            );
            enviado = r.ok;
          }
          if (!avisoDono.ok && !enviado && !link) return json({ error: "não consegui avisar a equipe agora" }, 502);
          return json({ ok: true, link, enviado });
        }

        const chat = chatSchema.safeParse(corpo);
        if (!chat.success) return json({ error: "corpo inválido" }, 400);
        if (!passou("chat:" + ip, 30, 600_000)) return json({ error: "muitas mensagens, tente em alguns minutos" }, 429);

        const key = process.env.GEMINI_API_KEY;
        if (!key) return json({ error: "IA indisponível" }, 503);

        const historico = chat.data.mensagens.slice(-14).map((m) => ({
          role: m.papel === "visitante" ? "user" : "model",
          parts: [{ text: m.texto }],
        }));
        if (historico[0].role !== "user") historico.shift();
        if (!historico.length || historico[historico.length - 1].role !== "user") return json({ error: "sem pergunta" }, 400);

        const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: MIA_ALEXANDRIA_PROMPT }] },
            contents: historico,
            generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
          }),
        });
        if (!res.ok) return json({ error: "a Mi.IA não conseguiu responder agora" }, 502);
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const resposta = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (!resposta) return json({ error: "sem resposta" }, 502);
        return json({ resposta: resposta.slice(0, 1200) });
      },
    },
  },
});
