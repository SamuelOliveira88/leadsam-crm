import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { montarPromptMia, MARCA_PASSAGEM } from "@/lib/mia-empresa";

async function quemSou(sb: any, userId: string) {
  const { data: perfil } = await sb.from("perfis").select("role, empresa_id").eq("id", userId).maybeSingle();
  if (!perfil?.empresa_id || !["master", "gerente"].includes(perfil.role)) throw new Error("Só master ou gerente configura a Mi.IA.");
  return perfil as { role: string; empresa_id: string };
}

// Conversa de teste: o dono fala com a Mi.IA como se fosse um cliente, usando as respostas já salvas.
export const testarMia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      mensagens: z.array(z.object({ papel: z.enum(["cliente", "mia"]), texto: z.string().min(1).max(700) })).min(1).max(30),
    }).parse(d))
  .handler(async ({ data, context }): Promise<{ resposta: string; passar: boolean }> => {
    const sb = context.supabase as any;
    const perfil = await quemSou(sb, context.userId);
    const { data: plano } = await sb.rpc("meu_plano");
    if (!plano?.mia) throw new Error("A Mi.IA precisa do plano Alexandria + Mi.IA (ou do teste de 7 dias).");
    const { data: cfg } = await sb.from("mia_config").select("respostas, site_referencia").eq("empresa_id", perfil.empresa_id).maybeSingle();
    const { data: emp } = await sb.from("empresas").select("nome").eq("id", perfil.empresa_id).maybeSingle();
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("IA indisponível no momento.");

    const historico = data.mensagens.slice(-14).map((m) => ({ role: m.papel === "cliente" ? "user" : "model", parts: [{ text: m.texto }] }));
    if (historico[0].role !== "user") historico.shift();
    if (!historico.length || historico[historico.length - 1].role !== "user") throw new Error("Escreva uma mensagem.");

    const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: montarPromptMia(emp?.nome ?? "a imobiliária", cfg?.respostas ?? {}, null) }] },
        contents: historico,
        generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error("A Mi.IA não conseguiu responder agora.");
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const bruto = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!bruto) throw new Error("A Mi.IA ficou sem resposta.");
    const passar = bruto.includes(MARCA_PASSAGEM);
    return { resposta: bruto.split(MARCA_PASSAGEM).join("").trim().slice(0, 1200), passar };
  });
