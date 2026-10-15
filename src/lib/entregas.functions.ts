import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ PAINEL DE ENTREGA DOS AVISOS (WhatsApp) ============

async function exigirGestor(context: { supabase: any; userId: string }): Promise<string> {
  const { data: perfil } = await context.supabase
    .from("perfis")
    .select("role, super_admin, empresa_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!perfil?.empresa_id) throw new Error("Seu perfil não está ligado a uma empresa.");
  if (!(perfil.super_admin || perfil.role === "master" || perfil.role === "gerente")) {
    throw new Error("Apenas master ou gerente podem ver as entregas.");
  }
  return perfil.empresa_id as string;
}

/** Pergunta à Evolution se o WhatsApp dos avisos está conectado. Nunca lança erro. */
async function estadoDoWhatsApp(): Promise<{ estado: "conectado" | "desconectado" | "indisponivel"; detalhe?: string }> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE_NOTIF || process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instancia) return { estado: "indisponivel", detalhe: "Evolution não configurada no servidor" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/instance/connectionState/${instancia}`, {
      headers: { apikey: key },
      signal: ctrl.signal,
    });
    if (!res.ok) return { estado: "indisponivel", detalhe: `Evolution respondeu ${res.status}` };
    const j: any = await res.json().catch(() => ({}));
    const state = j?.instance?.state ?? j?.state;
    return state === "open"
      ? { estado: "conectado" }
      : { estado: "desconectado", detalhe: `Situação: ${state ?? "desconhecida"}` };
  } catch (e: any) {
    return { estado: "indisponivel", detalhe: e?.name === "AbortError" ? "Sem resposta da Evolution (demorou mais de 6 s)" : "Não consegui falar com a Evolution" };
  } finally {
    clearTimeout(t);
  }
}

export const statusEntregas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresaId = await exigirGestor(context);
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const { data: linhas, error } = await context.supabase
      .from("fila_notificacoes")
      .select("id, status, tentativas, ultimo_erro, created_at, leads(nome), corretores(nome)")
      .eq("empresa_id", empresaId)
      .eq("tipo", "whatsapp")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const lista = (linhas ?? []) as any[];
    const contar = (...st: string[]) => lista.filter((l) => st.includes(l.status)).length;
    const problemas = lista
      .filter((l) => l.status === "erro" || l.status === "expirado")
      .slice(0, 15)
      .map((l) => ({
        id: l.id as string,
        status: l.status as string,
        lead: (l.leads?.nome as string | undefined) ?? "(lead removido)",
        corretor: (l.corretores?.nome as string | undefined) ?? "—",
        erro: (l.ultimo_erro as string | null) ?? null,
        tentativas: (l.tentativas as number) ?? 0,
        created_at: l.created_at as string,
      }));

    return {
      whatsapp: await estadoDoWhatsApp(),
      enviados: contar("enviado"),
      aguardando: contar("pendente"),
      comProblema: contar("erro", "expirado"),
      problemas,
    };
  });

export const reenviarAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const empresaId = await exigirGestor(context);
    const { data: rows, error } = await context.supabase
      .from("fila_notificacoes")
      .update({
        status: "pendente",
        tentativas: 0,
        proxima_tentativa: new Date().toISOString(),
        ultimo_erro: null,
        created_at: new Date().toISOString(), // renova a validade de 12 h
      })
      .eq("id", data.id)
      .eq("empresa_id", empresaId)
      .in("status", ["erro", "expirado"])
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Este aviso não pode ser reenviado.");
    return { ok: true };
  });

export const enviarAvisoTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ telefone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(10, "Telefone inválido").max(13, "Telefone inválido")) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestor(context);
    const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
    const r = await sendWhatsAppNotification(
      data.telefone,
      "✅ *Teste de aviso — Alexandria Leds*\nSe você recebeu esta mensagem, os avisos de lead novo vão chegar neste número.",
    );
    if (!r.ok) throw new Error(r.error ?? "Não foi possível enviar o teste.");
    return { ok: true };
  });
