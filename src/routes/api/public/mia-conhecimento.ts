import { createFileRoute } from "@tanstack/react-router";
import { MIA_ALEXANDRIA_PROMPT } from "@/lib/mia-alexandria.conhecimento";

// Texto da Mi.IA sobre o Alexandria. O n8n lê isto para a Mi.IA do WhatsApp responder as dúvidas
// de quem chega pela tag ALEXANDRIA-SITE. É um texto público (o mesmo que o chat da página usa).
export const Route = createFileRoute("/api/public/mia-conhecimento")({
  server: {
    handlers: {
      GET: async () =>
        new Response(MIA_ALEXANDRIA_PROMPT, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
        }),
    },
  },
});
