import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Elo com a Sara/Jarbas (WhatsApp): troca de etapas do funil nos dois sentidos.
//  GET  ?desde=ISO&limite=200  -> mudanças de etapa feitas no CRM (para a Sara/Jarbas copiar)
//  POST { mudancas: [{ telefone, etapa }] } -> aplica etapas vindas do WhatsApp
// Server a server: sem CORS. Token só no cabeçalho x-webhook-token, e só vale o token
// chamado "elo-whatsapp" (criado pelo master da empresa). A empresa vem SEMPRE do token.

const cabecalhos = { "content-type": "application/json", "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cabecalhos });

const NOME_DO_TOKEN = "elo-whatsapp";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function empresaDoToken(db: any, request: Request): Promise<string | null> {
  const { tokenDoCabecalho, sha256Hex } = await import("@/lib/empresa-token.server");
  const token = tokenDoCabecalho(request);
  if (!token) return null;
  const { data } = await db
    .from("webhook_tokens")
    .select("empresa_id")
    .eq("token_hash", await sha256Hex(token))
    .eq("nome", NOME_DO_TOKEN)
    .eq("ativo", true)
    .maybeSingle();
  return data?.empresa_id ?? null;
}

const postSchema = z.object({
  mudancas: z
    .array(z.object({ telefone: z.string().min(8).max(20), etapa: z.string().min(1).max(60) }))
    .min(1)
    .max(200),
});

export const Route = createFileRoute("/api/public/elo-whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = await admin();
        const empresaId = await empresaDoToken(db, request);
        if (!empresaId) return json({ error: "unauthorized" }, 401);
        const { empresaLiberada, RESPOSTA_TESTE_ENCERRADO } = await import("@/lib/empresa-token.server");
        if (!(await empresaLiberada(db, empresaId))) return json(RESPOSTA_TESTE_ENCERRADO, 403);

        const url = new URL(request.url);
        const desde = new Date(url.searchParams.get("desde") ?? "");
        if (Number.isNaN(desde.getTime())) return json({ error: "desde inválido (use data ISO)" }, 400);
        const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? "200") || 200, 1), 500);

        const { data, error } = await db.rpc("elo_mudancas_etapa", {
          p_empresa_id: empresaId,
          p_desde: desde.toISOString(),
          p_limite: limite,
        });
        if (error) return json({ error: "falha ao ler mudanças" }, 500);
        const mudancas = (data ?? []) as Array<{ telefone: string; etapa: string; em: string }>;
        return json({ mudancas, proximo: mudancas.length ? mudancas[mudancas.length - 1].em : desde.toISOString() });
      },

      POST: async ({ request }) => {
        const db = await admin();
        const empresaId = await empresaDoToken(db, request);
        if (!empresaId) return json({ error: "unauthorized" }, 401);
        const { empresaLiberada, RESPOSTA_TESTE_ENCERRADO } = await import("@/lib/empresa-token.server");
        if (!(await empresaLiberada(db, empresaId))) return json(RESPOSTA_TESTE_ENCERRADO, 403);

        const corpo = await request.json().catch(() => null);
        const parsed = postSchema.safeParse(corpo);
        if (!parsed.success) return json({ error: "corpo inválido" }, 400);

        let alteradas = 0, iguais = 0, naoEncontradas = 0, erros = 0;
        for (const m of parsed.data.mudancas) {
          const { data, error } = await db.rpc("elo_aplicar_etapa", {
            p_empresa_id: empresaId,
            p_telefone: m.telefone,
            p_etapa: m.etapa,
          });
          if (error || !data?.ok) erros++;
          else if (!data.achou) naoEncontradas++;
          else if (data.alterou) alteradas++;
          else iguais++;
        }
        return json({ ok: true, alteradas, iguais, naoEncontradas, erros });
      },
    },
  },
});
