import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// A "ponte" (serviço na VPS, ao lado do Asterisk) conversa com o Alexandria só por aqui.
// Ela é quem faz a chamada de saída (HTTPS de dentro para fora): o Asterisk e a ARI nunca ficam expostos.
// Autenticação: cabeçalho x-ponte-token igual à variável DISCADOR_PONTE_TOKEN.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function tokenValido(request: Request): Promise<boolean> {
  const esperado = process.env.DISCADOR_PONTE_TOKEN;
  const recebido = request.headers.get("x-ponte-token") ?? "";
  if (!esperado || esperado.length < 24 || !recebido) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bodySchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("buscar") }),
  z.object({
    acao: z.literal("evento"),
    id: z.string().uuid(),
    tipo: z.enum(["atendida", "encerrada", "falhou"]),
    duracao_seg: z.number().int().min(0).max(86400).optional(),
    gravacao_path: z.string().max(300).optional(),
    motivo: z.string().max(200).optional(),
  }),
]);

export const Route = createFileRoute("/api/public/discador-ponte")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await tokenValido(request))) return json({ error: "não autorizado" }, 401);
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "pedido inválido" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        if (body.acao === "buscar") {
          // Pedidos antigos que ninguém pegou viram falha (o corretor não fica esperando para sempre).
          const velhas = new Date(Date.now() - 60_000).toISOString();
          await db.from("discador_chamadas").update({ status: "falhou", motivo_falha: "Discador fora do ar", encerrada_em: new Date().toISOString() })
            .eq("status", "pedida").lt("created_at", velhas);

          const { data: ramais } = await db.from("discador_ramais").select("ramal, sip_senha");
          // Pega os pedidos de forma atômica: só quem consegue mudar de "pedida" para "discando" leva.
          const { data: pedidas } = await db.from("discador_chamadas").select("id, telefone, ramal").eq("status", "pedida").order("created_at").limit(10);
          const minhas: { id: string; telefone: string; ramal: string }[] = [];
          for (const c of (pedidas ?? []) as any[]) {
            const { data: ok } = await db.from("discador_chamadas").update({ status: "discando" }).eq("id", c.id).eq("status", "pedida").select("id");
            if (ok?.length) minhas.push({ id: c.id, telefone: c.telefone, ramal: c.ramal });
          }
          return json({
            ramais: ((ramais ?? []) as any[]).map((r) => ({ ramal: r.ramal, senha: r.sip_senha })),
            pedidas: minhas,
          });
        }

        // acao === "evento"
        const agora = new Date().toISOString();
        const { data: ch } = await db.from("discador_chamadas").select("id, perfil_id, status").eq("id", body.id).maybeSingle();
        if (!ch) return json({ error: "chamada não encontrada" }, 404);
        if (ch.status === "encerrada" || ch.status === "falhou") return json({ ok: true, ignorado: true });

        if (body.tipo === "atendida") {
          await db.from("discador_chamadas").update({ status: "atendida", atendida_em: agora }).eq("id", ch.id);
        } else {
          await db.from("discador_chamadas").update({
            status: body.tipo,
            duracao_seg: body.duracao_seg ?? null,
            gravacao_path: body.gravacao_path ?? null,
            motivo_falha: body.tipo === "falhou" ? (body.motivo ?? "Não completou") : null,
            encerrada_em: agora,
          }).eq("id", ch.id);
          // Terminou: o corretor passa a "preenchendo" até marcar o resultado.
          await db.from("discador_ramais").update({ estado: "preenchendo", estado_em: agora }).eq("perfil_id", ch.perfil_id);
        }
        return json({ ok: true });
      },
    },
  },
});
