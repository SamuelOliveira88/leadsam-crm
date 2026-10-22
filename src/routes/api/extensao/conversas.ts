import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extensao/conversas")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-extensao.server")).opcoes(),
      GET: async ({ request }) => {
        const { autenticar, resposta } = await import("@/lib/api-extensao.server");
        const a = await autenticar(request);
        if (a instanceof Response) return a;
        try {
          const { listarConversasCore } = await import("@/lib/conversas.core");
          return resposta(await listarConversasCore(a.sb, a.userId));
        } catch (e: any) {
          return resposta({ error: e?.message ?? "Erro ao listar conversas." }, 400);
        }
      },
    },
  },
});
