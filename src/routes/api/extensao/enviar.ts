import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extensao/enviar")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-extensao.server")).opcoes(),
      POST: async ({ request }) => {
        const { autenticar, resposta } = await import("@/lib/api-extensao.server");
        const a = await autenticar(request);
        if (a instanceof Response) return a;
        const body: any = await request.json().catch(() => ({}));
        const leadId = String(body?.lead_id ?? "");
        const texto = String(body?.texto ?? "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(leadId)) return resposta({ error: "lead_id inválido." }, 400);
        if (!texto || texto.length > 4000) return resposta({ error: "Mensagem vazia ou grande demais." }, 400);
        try {
          const { enviarMensagemCore } = await import("@/lib/conversas.core");
          return resposta(await enviarMensagemCore(a.sb, leadId, texto));
        } catch (e: any) {
          return resposta({ error: e?.message ?? "Não foi possível enviar." }, 400);
        }
      },
    },
  },
});
