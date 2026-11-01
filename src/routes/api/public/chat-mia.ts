import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MIA_ALEXANDRIA_PROMPT } from "@/lib/mia-alexandria.conhecimento";
import { idiomaValido, regraIdioma, type Idioma } from "@/lib/idioma";

// Chat da Mi.IA na página de vendas do Alexandria.
//  POST { mensagens: [{ papel: "visitante"|"mia", texto }] }          -> { resposta }
//  POST { acao: "lead", nome, whatsapp }                               -> { ok, whatsapp_link }
// Sem login (é página pública). Segurança (A5, revisão 01/11):
//  * limite de uso GRAVADO NO BANCO (tabela limites_uso, função consumir_limite): vale para todas as
//    instâncias da Vercel, ao contrário do limite em memória de antes;
//  * NUNCA manda WhatsApp para o número digitado pelo visitante (ninguém confirmou que o número é dele).
//    Só o dono recebe o aviso; o visitante ganha um link wa.me para ELE iniciar a conversa;
//  * convite de teste automático desligado por padrão (CHAT_CONVITE_AUTOMATICO=1 liga; mesmo assim
//    o link só aparece na tela, nunca vai por WhatsApp).

const cab = { "content-type": "application/json", "cache-control": "no-store" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cab });

const DONO_WHATSAPP = () => (process.env.DONO_WHATSAPP || "5511932368278").replace(/\D/g, "");

// Vercel preenche x-real-ip / x-forwarded-for com o IP do visitante.
const ipDe = (r: Request) =>
  (r.headers.get("x-real-ip") ?? r.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";

/** Conta um uso no banco. Se o banco falhar, NEGA (melhor um 429 do que spam). */
async function passou(chave: string, max: number, janelaSeg: number): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("consumir_limite", {
      p_chave: chave, p_max: max, p_janela_segundos: janelaSeg,
    });
    if (error) { console.error("[chat-mia] limite", error.message); return false; }
    return data === true;
  } catch (e) {
    console.error("[chat-mia] limite", e);
    return false;
  }
}

const chatSchema = z.object({
  mensagens: z
    .array(z.object({ papel: z.enum(["visitante", "mia"]), texto: z.string().min(1).max(700) }))
    .min(1)
    .max(30),
  idioma: z.string().optional(), // idioma da página (pt, en, es); só ajuda quando a mensagem não dá pista
});
const leadSchema = z.object({
  acao: z.literal("lead"),
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().min(10).max(20),
  idioma: z.string().optional(),
});

export const Route = createFileRoute("/api/public/chat-mia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = ipDe(request);
        const corpo = await request.json().catch(() => null);

        const lead = leadSchema.safeParse(corpo);
        if (lead.success) {
          const digitos = lead.data.whatsapp.replace(/\D/g, "");
          if (digitos.length < 10 || digitos.length > 13) return json({ error: "WhatsApp inválido" }, 400);
          if (!(await passou("chat-lead:ip:" + ip, 3, 3600))) return json({ error: "muitas tentativas" }, 429);
          if (!(await passou("chat-lead:tel:" + digitos, 1, 86400))) return json({ error: "este número já foi registrado hoje" }, 429);
          // teto geral do dia: protege o número do dono mesmo com IPs trocados
          if (!(await passou("chat-lead:dia", 40, 86400))) return json({ error: "muitos pedidos hoje, fale pelo WhatsApp" }, 429);

          const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
          const dono = DONO_WHATSAPP();

          // Convite automático: desligado no piloto. Se ligado, o link só aparece na tela.
          let link: string | null = null;
          if (process.env.CHAT_CONVITE_AUTOMATICO === "1" && (await passou("chat-convite:dia", 10, 86400))) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const letras = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
            for (let i = 0; i < 5 && !link; i++) {
              const bytes = crypto.getRandomValues(new Uint8Array(8));
              const c = Array.from(bytes, (b) => letras[b % letras.length]).join("");
              const { error } = await (supabaseAdmin as any).from("convites_codigo").insert({
                codigo: c, criado_por: null, expira_em: new Date(Date.now() + 7 * 86_400_000).toISOString(),
              });
              if (!error) {
                const site = (process.env.SITE_URL || "https://www.alexandrialeads.app").replace(/\/+$/, "");
                link = `${site}/cadastro-empresa?codigo=${c}`;
              }
            }
          }

          // Só o DONO recebe WhatsApp. O número do visitante vai no texto para você chamar.
          const avisoDono = await sendWhatsAppNotification(
            dono,
            `🔔 *Interesse no Alexandria (página de vendas)*\nNome: ${lead.data.nome.slice(0, 80)}\nWhatsApp informado (não verificado): ${digitos}\n${link ? "Convite mostrado na tela." : "Sem convite automático: chame e, se fizer sentido, gere o convite no painel."}`,
          );
          const texto = encodeURIComponent(`Oi! Sou ${lead.data.nome.split(/\s+/)[0]} e quero conhecer o Alexandria.`);
          const whatsapp_link = `https://wa.me/${dono}?text=${texto}`;
          if (!avisoDono.ok) console.error("[chat-mia] aviso ao dono não saiu:", avisoDono.error);
          return json({ ok: true, link, enviado: false, whatsapp_link });
        }

        const chat = chatSchema.safeParse(corpo);
        if (!chat.success) return json({ error: "corpo inválido" }, 400);
        if (!(await passou("chat-ia:ip:" + ip, 30, 600))) return json({ error: "muitas mensagens, tente em alguns minutos" }, 429);
        if (!(await passou("chat-ia:dia", 3000, 86400))) return json({ error: "a Mi.IA está ocupada agora, fale pelo WhatsApp" }, 429);

        const key = process.env.GEMINI_API_KEY;
        if (!key) return json({ error: "IA indisponível" }, 503);

        const idiomaPagina: Idioma = idiomaValido(chat.data.idioma) ? chat.data.idioma : "pt";
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
            systemInstruction: { parts: [{ text: MIA_ALEXANDRIA_PROMPT + "\n\n" + regraIdioma(idiomaPagina) }] },
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
