import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { montarPromptMia, MARCA_PASSAGEM } from "@/lib/mia-empresa";

// A Mi.IA responde o lead novo do número mãe antes do corretor.
// Chamado pelo banco (receber_mensagem_whatsapp) com { mensagem_id }. Sem segredo: só age sobre uma mensagem real,
// recém-chegada, de um lead que a Mi.IA está atendendo, e só uma vez por mensagem (trava mia_processada).
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const MAX_RESPOSTAS_MIA = 6; // depois disso, passa para o corretor de qualquer jeito
const FRASE_PASSAGEM = "Vou chamar um dos nossos corretores para continuar com você. Já já ele te responde por aqui 😊";

export const Route = createFileRoute("/api/public/mia-atender")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corpo = await request.json().catch(() => null);
        const p = z.object({ mensagem_id: z.string().uuid() }).safeParse(corpo);
        if (!p.success) return json({ error: "corpo inválido" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as any;

        // Pega a vez desta mensagem (só uma execução por mensagem; mensagem com mais de 10 min fica com a varredura).
        const desde = new Date(Date.now() - 10 * 60_000).toISOString();
        const { data: msg } = await sb.from("lead_mensagens").update({ mia_processada: true })
          .eq("id", p.data.mensagem_id).eq("direcao", "entrada").eq("mia_processada", false).gte("created_at", desde)
          .select("id, lead_id, empresa_id, texto, midia_tipo").maybeSingle();
        if (!msg) return json({ ok: true, ignorado: true });

        const passar = async (motivo: string) => {
          await sb.rpc("mia_passar_corretor", { p_lead: msg.lead_id });
          return json({ ok: true, passou: true, motivo });
        };

        const { data: lead } = await sb.from("leads").select("id, nome, mia_estado, empresa_id").eq("id", msg.lead_id).maybeSingle();
        if (!lead || lead.mia_estado !== "atendendo") return json({ ok: true, ignorado: "lead não está com a Mi.IA" });

        const { data: pode } = await sb.rpc("mia_pode_atender", { p_empresa: lead.empresa_id });
        if (!pode) return passar("fora do horário ou do plano");

        const key = process.env.GEMINI_API_KEY;
        if (!key) return passar("IA indisponível");

        const [{ data: cfg }, { data: emp }, { data: hist }] = await Promise.all([
          sb.from("mia_config").select("respostas, site_referencia").eq("empresa_id", lead.empresa_id).maybeSingle(),
          sb.from("empresas").select("nome").eq("id", lead.empresa_id).maybeSingle(),
          sb.from("lead_mensagens").select("direcao, texto, mia, created_at").eq("lead_id", msg.lead_id)
            .order("created_at", { ascending: false }).limit(14),
        ]);

        const jaRespondeu = (hist ?? []).filter((m: any) => m.mia).length;
        const ordem = [...(hist ?? [])].reverse().filter((m: any) => (m.texto ?? "").trim());
        const contents: { role: string; parts: { text: string }[] }[] = [];
        for (const m of ordem) {
          const role = m.direcao === "entrada" ? "user" : "model";
          const texto = String(m.texto).slice(0, 700);
          const ult = contents[contents.length - 1];
          if (ult && ult.role === role) ult.parts[0].text += "\n" + texto; else contents.push({ role, parts: [{ text: texto }] });
        }
        while (contents.length && contents[0].role !== "user") contents.shift();
        if (!contents.length || contents[contents.length - 1].role !== "user") return passar("sem mensagem do cliente");

        const instrucao = montarPromptMia(emp?.nome ?? "a imobiliária", cfg?.respostas ?? {}, null) +
          `\n\nO nome que o cliente usa no WhatsApp é: ${String(lead.nome ?? "").slice(0, 60) || "não informado"}.`;
        const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        let resposta = "";
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: instrucao }] },
              contents,
              generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
            }),
          });
          if (res.ok) {
            const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            resposta = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
          }
        } catch { /* cai na passagem abaixo */ }
        if (!resposta) return passar("a IA não respondeu"); // nunca deixa o cliente sem resposta

        const querPassar = resposta.includes(MARCA_PASSAGEM) || jaRespondeu + 1 >= MAX_RESPOSTAS_MIA;
        let texto = resposta.split(MARCA_PASSAGEM).join("").trim();
        if (!texto) texto = FRASE_PASSAGEM;
        else if (querPassar && !resposta.includes(MARCA_PASSAGEM)) texto += "\n\n" + FRASE_PASSAGEM;

        const { error } = await sb.rpc("mia_enviar", { p_lead: msg.lead_id, p_texto: texto });
        if (error) { console.error("[mia-atender] enviar", error.message); return passar("falha ao enviar"); }
        if (querPassar) return passar("regra de passagem");
        return json({ ok: true, respondeu: true });
      },
    },
  },
});
