import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diag-evo")({
  server: {
    handlers: {
      GET: async () => {
        const raw = process.env.EVOLUTION_API_URL ?? "";
        let host = "";
        try {
          host = new URL(raw).host;
        } catch {
          host = "invalido";
        }
        let status = 0;
        try {
          const r = await fetch(raw, { method: "GET" });
          status = r.status;
        } catch (e: any) {
          status = -1;
        }
        return new Response(JSON.stringify({ host, status }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
