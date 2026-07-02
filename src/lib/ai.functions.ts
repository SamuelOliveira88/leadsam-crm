import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  return createLovableAiGatewayProvider(key)("google/gemini-3-flash-preview");
}

export const gerarSugestaoDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: leads } = await context.supabase
      .from("leads")
      .select("nome, estagio, origem, interesse, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    const resumo = (leads ?? [])
      .map((l) => `- ${l.nome} (${l.estagio}, origem ${l.origem}${l.interesse ? `, interesse ${l.interesse}` : ""})`)
      .join("\n");
    const { text } = await generateText({
      model: getModel(),
      system:
        "Você é um consultor sênior de vendas imobiliárias no Brasil. Dê uma única sugestão prática, direta e curta (máx 2 frases) para o corretor agir AGORA baseado nos leads. Fale em português brasileiro, sem emojis excessivos, tom profissional e caloroso.",
      prompt: `Leads recentes do corretor:\n${resumo || "(sem leads ainda)"}\n\nDê UMA sugestão de próxima ação.`,
    });
    return { sugestao: text.trim() };
  });

export const gerarMensagemWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("nome, telefone, estagio, origem, interesse")
      .eq("id", data.leadId)
      .single();
    if (error || !lead) throw new Error("Lead não encontrado");
    const { text } = await generateText({
      model: getModel(),
      system:
        "Você é um corretor de imóveis brasileiro. Escreva uma mensagem de WhatsApp curta (máx 4 linhas), calorosa e profissional em português brasileiro para retomar contato com o lead. Use no máximo 1 emoji. Não inclua links. Termine com uma pergunta convidativa.",
      prompt: `Lead: ${lead.nome}\nEstágio: ${lead.estagio}\nOrigem: ${lead.origem}\nInteresse: ${lead.interesse ?? "não informado"}`,
    });
    return { mensagem: text.trim(), telefone: lead.telefone };
  });
