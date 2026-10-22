import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extensao/mensagens")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-extensao.server")).opcoes(),
      GET: async ({ request }) => {
        const { autenticar, resposta } = await import("@/lib/api-extensao.server");
        const a = await autenticar(request);
        if (a instanceof Response) return a;
        const leadId = new URL(request.url).searchParams.get("lead_id") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(leadId)) return resposta({ error: "lead_id inválido." }, 400);
        try {
          const { mensagensDoLeadCore } = await import("@/lib/conversas.core");
          return resposta(await mensagensDoLeadCore(a.sb, leadId));
        } catch (e: any) {
          return resposta({ error: e?.message ?? "Erro ao abrir a conversa." }, 400);
        }
      },
    },
  },
});
