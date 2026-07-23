import { createFileRoute } from "@tanstack/react-router";

// Rota temporária para testar se erros de requisições JSON retornam JSON (não HTML).
export const Route = createFileRoute("/api/public/test-error")({
  server: {
    handlers: {
      GET: async () => {
        throw new Error("Erro de teste intencional");
      },
    },
  },
});
