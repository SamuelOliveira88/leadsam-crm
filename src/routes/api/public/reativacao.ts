import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const EMPRESA_ID = "1765d307-d778-48da-b96d-201ad7d7776c"; // Samuel Imob

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function autorizado(request: Request, url: URL) {
  const expected = process.env.REATIVACAO_API_KEY;
  const provided =
    request.headers.get("x-api-key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("key");
  return Boolean(expected) && provided === expected;
}

function admin() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const patchSchema = z.object({
  telefone: z.string().min(8).max(20),
});

export const Route = createFileRoute("/api/public/reativacao")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!autorizado(request, url)) return json({ error: "unauthorized" }, 401);

        const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

        const { data, error } = await admin()
          .from("leads")
          .select("nome, telefone, empreendimento_interesse")
          .eq("empresa_id", EMPRESA_ID)
          .eq("status", "frio")
          .eq("opt_out", false)
          .order("created_at", { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, total: data?.length ?? 0, leads: data ?? [] });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (!autorizado(request, url)) return json({ error: "unauthorized" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "json inválido" }, 400);
        }
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) return json({ error: "telefone obrigatório" }, 400);

        const digits = parsed.data.telefone.replace(/\D/g, "");
        const sufixo = digits.slice(-8);

        const { data, error } = await admin()
          .from("leads")
          .update({
            status: "contatado_reativacao",
            ultimo_contato: new Date().toISOString(),
          })
          .eq("empresa_id", EMPRESA_ID)
          .eq("opt_out", false)
          .like("telefone", `%${sufixo}`)
          .select("nome, telefone, status, ultimo_contato");

        if (error) return json({ error: error.message }, 500);
        if (!data || data.length === 0) return json({ ok: false, error: "lead não encontrado" }, 404);
        return json({ ok: true, atualizados: data.length, leads: data });
      },
    },
  },
});
