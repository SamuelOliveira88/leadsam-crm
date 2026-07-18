import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarNotas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_notas")
      .select("id, texto, autor_id, created_at")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const criarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: z.string().uuid(), texto: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_notas")
      .insert({ lead_id: data.lead_id, texto: data.texto, autor_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const marcarLeadVisualizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ visualizado_em: new Date().toISOString(), ultima_atividade_em: new Date().toISOString() })
      .eq("id", data.lead_id)
      .is("visualizado_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const gerarMensagemAbertura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: z.string().uuid(), interesse: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Lovable AI não configurado");

    const { data: lead } = await context.supabase
      .from("leads")
      .select("nome, telefone, email")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");

    const prompt = `Você é um corretor de imóveis brasileiro. Escreva uma mensagem CURTA (máx 4 linhas) e amigável para iniciar conversa no WhatsApp com o lead abaixo. Use o primeiro nome, seja natural e termine com uma pergunta aberta.\n\nLead: ${lead.nome}\nInteresse: ${data.interesse ?? "imóvel"}\n\nResponda APENAS com o texto da mensagem, sem aspas ou introduções.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`IA falhou (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const mensagem = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { mensagem, telefone: lead.telefone ?? "" };
  });
