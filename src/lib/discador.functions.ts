import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ehNumeroMae, souCorretorPuro, listaEstaBlindada } from "@/lib/telefone-oculto";
import {
  ESTADOS_ESCOLHIDOS,
  LIMITES_DISCADOR,
  RESULTADOS_DISCADOR,
  dentroDoHorario,
  normalizarTelefoneBR,
  notaChamadaDiscador,
} from "@/lib/discador";

// ============ DISCADOR (modo preview) ============
// O corretor escolhe o lead e clica Ligar. O servidor valida as regras e grava o pedido;
// a "ponte" (serviço na VPS ao lado do Asterisk) busca o pedido e faz a ligação.

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Ctx = { supabase: any; userId: string };

async function perfilDe(context: Ctx) {
  const { data } = await context.supabase
    .from("perfis")
    .select("role, corretor_id, empresa_id, acesso_total, super_admin")
    .eq("id", context.userId)
    .maybeSingle();
  const p = data as any;
  if (!p?.empresa_id) throw new Error("Seu perfil não está ligado a uma empresa.");
  return p as { role: string; corretor_id: string | null; empresa_id: string; acesso_total: boolean | null; super_admin: boolean | null };
}

/** Corretor só vê os próprios leads (mesma regra da lista de leads). */
function soMeus(p: Awaited<ReturnType<typeof perfilDe>>) {
  return !!p.corretor_id && !p.acesso_total && !p.super_admin && p.role === "corretor";
}

/** Configuração do telefone no navegador. Vem das variáveis de ambiente do servidor. */
function configTelefone() {
  const host = process.env.DISCADOR_SIP_HOST;
  if (!host) return null;
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: `stun:${host}:3478` },
  ];
  if (process.env.DISCADOR_TURN_USER && process.env.DISCADOR_TURN_PASS) {
    iceServers.push({
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`, `turns:${host}:5349?transport=tcp`],
      username: process.env.DISCADOR_TURN_USER,
      credential: process.env.DISCADOR_TURN_PASS,
    });
  }
  return { wss: `wss://${host}:8089/ws`, dominio: host, iceServers };
}

export const meuDiscador = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await perfilDe(context);
    const db = await admin();
    let { data: r } = await db.from("discador_ramais").select("ramal, sip_senha, estado").eq("perfil_id", context.userId).maybeSingle();
    if (!r) {
      const { randomBytes } = await import("node:crypto");
      const novo = {
        perfil_id: context.userId,
        empresa_id: p.empresa_id,
        ramal: "u" + context.userId.replace(/-/g, "").slice(0, 10),
        sip_senha: randomBytes(16).toString("hex"),
      };
      const { data, error } = await db.from("discador_ramais").upsert(novo, { onConflict: "perfil_id" }).select("ramal, sip_senha, estado").single();
      if (error) throw new Error(error.message);
      r = data;
    }
    const cfg = configTelefone();
    return {
      configurado: !!cfg,
      ramal: r.ramal as string,
      senha: r.sip_senha as string,
      estado: r.estado as string,
      wss: cfg?.wss ?? null,
      dominio: cfg?.dominio ?? null,
      iceServers: cfg?.iceServers ?? [],
    };
  });

export const definirEstado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ estado: z.enum(ESTADOS_ESCOLHIDOS) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    // Em ligação ou preenchendo ficha, o corretor não troca de estado por aqui.
    const { data: atual } = await db.from("discador_ramais").select("estado").eq("perfil_id", context.userId).maybeSingle();
    if (!atual) throw new Error("Ramal ainda não criado.");
    if (atual.estado === "ocupado") throw new Error("Você está em uma ligação.");
    if (atual.estado === "preenchendo" && data.estado === "pronto") {
      throw new Error("Marque o resultado da última ligação antes de ficar Pronto.");
    }
    const { error } = await db
      .from("discador_ramais")
      .update({ estado: data.estado, estado_em: new Date().toISOString() })
      .eq("perfil_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Leads que o corretor pode discar. O telefone nunca vai para a tela. */
export const leadsParaDiscar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ busca: z.string().max(80).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const p = await perfilDe(context);
    const pura = await souCorretorPuro(context.supabase, context.userId);
    const blind = pura ? await listaEstaBlindada(context.supabase) : true;
    let q = context.supabase
      .from("leads")
      .select("id, nome, cidade, fonte, telefone, status")
      .eq("empresa_id", p.empresa_id)
      .not("telefone", "is", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (soMeus(p)) q = q.eq("corretor_id", p.corretor_id!);
    const busca = data.busca?.trim();
    if (busca) q = q.ilike("nome", `%${busca.replace(/[%_,()]/g, " ")}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((l) => ({
      id: l.id as string,
      nome: (l.nome as string) ?? "Sem nome",
      cidade: (l.cidade as string | null) ?? null,
      status: (l.status as string | null) ?? null,
      // Quem chegou pelo número mãe não pode ser discado por corretor (ele não pode ver o número).
      bloqueado: (pura && ehNumeroMae(l, blind)) || !normalizarTelefoneBR(l.telefone),
    }));
  });

export const ligarLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await perfilDe(context);
    const db = await admin();

    if (!dentroDoHorario()) {
      throw new Error(
        `Fora do horário de ligação (${LIMITES_DISCADOR.horaInicio}h às ${LIMITES_DISCADOR.horaFim}h, de segunda a sexta).`,
      );
    }

    const { data: ramal } = await db.from("discador_ramais").select("ramal, estado").eq("perfil_id", context.userId).maybeSingle();
    if (!ramal) throw new Error("Abra a tela do Discador primeiro para criar o seu telefone.");
    if (ramal.estado !== "pronto") throw new Error("Fique em “Pronto” para ligar.");

    // Lead visível para este usuário (a consulta passa pelo RLS e pelo filtro de corretor).
    let q = context.supabase.from("leads").select("id, nome, telefone, fonte, empresa_id").eq("id", data.lead_id).eq("empresa_id", p.empresa_id);
    if (soMeus(p)) q = q.eq("corretor_id", p.corretor_id!);
    const { data: lead } = await q.maybeSingle();
    if (!lead) throw new Error("Lead não encontrado.");
    const pura = await souCorretorPuro(context.supabase, context.userId);
    if (pura && ehNumeroMae(lead as any, await listaEstaBlindada(context.supabase))) {
      throw new Error("Este lead chegou pelo número mãe: atenda pela tela Conversas.");
    }
    const telefone = normalizarTelefoneBR((lead as any).telefone);
    if (!telefone) throw new Error("Telefone inválido para ligação.");

    const { data: bloqueado } = await db
      .from("discador_optout").select("id").eq("empresa_id", p.empresa_id).eq("telefone", telefone).maybeSingle();
    if (bloqueado) throw new Error("Este número pediu para não ser ligado.");

    const desde24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await db
      .from("discador_chamadas").select("id", { count: "exact", head: true })
      .eq("empresa_id", p.empresa_id).eq("telefone", telefone).gte("created_at", desde24h);
    if ((count ?? 0) >= LIMITES_DISCADOR.tentativasPorLead24h) {
      throw new Error(`Já foram feitas ${LIMITES_DISCADOR.tentativasPorLead24h} tentativas nas últimas 24h para este número.`);
    }

    // Uma chamada por vez por corretor.
    const viva = new Date(Date.now() - LIMITES_DISCADOR.chamadaMortaMin * 60_000).toISOString();
    const { count: emAndamento } = await db
      .from("discador_chamadas").select("id", { count: "exact", head: true })
      .eq("perfil_id", context.userId).in("status", ["pedida", "discando", "atendida"]).gte("created_at", viva);
    if ((emAndamento ?? 0) > 0) throw new Error("Você já tem uma ligação em andamento.");

    const { data: chamada, error } = await db
      .from("discador_chamadas")
      .insert({ empresa_id: p.empresa_id, lead_id: lead.id, perfil_id: context.userId, ramal: ramal.ramal, telefone })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db.from("discador_ramais").update({ estado: "ocupado", estado_em: new Date().toISOString() }).eq("perfil_id", context.userId);
    return { chamada_id: chamada.id as string, nome: (lead as any).nome as string };
  });

/** Última chamada do corretor que ainda não teve o resultado marcado. */
export const minhaChamadaAtual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    // Se a ponte caiu e ninguém pegou o pedido em 60s, dá a chamada como falha e libera o corretor.
    const db = await admin();
    const agora = new Date().toISOString();
    const { data: expiradas } = await db.from("discador_chamadas")
      .update({ status: "falhou", motivo_falha: "Discador fora do ar", encerrada_em: agora })
      .eq("perfil_id", context.userId).eq("status", "pedida")
      .lt("created_at", new Date(Date.now() - 60_000).toISOString()).select("id");
    if (expiradas?.length) {
      await db.from("discador_ramais").update({ estado: "preenchendo", estado_em: agora }).eq("perfil_id", context.userId);
    }
    const { data } = await (context.supabase as any)
      .from("discador_chamadas")
      .select("id, lead_id, status, motivo_falha, duracao_seg, resultado, created_at, atendida_em, leads(nome)")
      .eq("perfil_id", context.userId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const c = data as any;
    if (!c || c.resultado) return null;
    return {
      id: c.id as string,
      lead_id: (c.lead_id as string | null) ?? null,
      lead_nome: (c.leads?.nome as string | undefined) ?? "Lead",
      status: c.status as string,
      motivo_falha: (c.motivo_falha as string | null) ?? null,
      duracao_seg: (c.duracao_seg as number | null) ?? null,
      atendida_em: (c.atendida_em as string | null) ?? null,
    };
  });

export const marcarResultado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      chamada_id: z.string().uuid(),
      resultado: z.enum(RESULTADOS_DISCADOR.map((r) => r.id) as [string, ...string[]]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const p = await perfilDe(context);
    const db = await admin();
    const { data: ch } = await db.from("discador_chamadas").select("*").eq("id", data.chamada_id).eq("perfil_id", context.userId).maybeSingle();
    if (!ch) throw new Error("Chamada não encontrada.");
    if (ch.status === "pedida" || ch.status === "discando" || ch.status === "atendida") {
      throw new Error("A ligação ainda não terminou.");
    }

    await db.from("discador_chamadas").update({ resultado: data.resultado }).eq("id", ch.id);

    if (data.resultado === "nao_ligar_mais") {
      await db.from("discador_optout").upsert(
        { empresa_id: p.empresa_id, telefone: ch.telefone, motivo: "Pedido na ligação", criado_por: context.userId },
        { onConflict: "empresa_id,telefone" },
      );
    }

    // Registro no histórico do lead (mesma tabela das notas), com o usuário logado como autor.
    if (ch.lead_id) {
      const rotulo = RESULTADOS_DISCADOR.find((r) => r.id === data.resultado)?.rotulo ?? data.resultado;
      await context.supabase.from("lead_notas").insert({
        lead_id: ch.lead_id,
        texto: notaChamadaDiscador(rotulo, ch.duracao_seg),
        autor_id: context.userId,
      });
    }

    // Terminou o preenchimento: volta para "Pronto" para ligar o próximo.
    await db.from("discador_ramais").update({ estado: "pronto", estado_em: new Date().toISOString() }).eq("perfil_id", context.userId);
    return { ok: true };
  });
