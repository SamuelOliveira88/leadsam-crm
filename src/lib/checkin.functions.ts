import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ CHECK-IN COM GEOLOCALIZAÇÃO ============
// A decisão "está dentro do raio?" é tomada no banco (função registrar_checkin),
// nunca no aparelho. Aqui só chamamos a função e avisamos o monitor no WhatsApp.

const PosicaoInput = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  precisaoMetros: z.number().finite().min(0).max(100000).optional().nullable(),
});

export type ResultadoCheckin = {
  id: string;
  tipo: "login" | "checkin";
  dentro: boolean | null;
  distancia_metros: number | null;
  local_nome: string | null;
  created_at: string;
};

export function linkMapa(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

export function textoDistancia(metros: number | null | undefined): string {
  if (metros == null) return "—";
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

async function nomeDoUsuario(context: { supabase: any; userId: string }): Promise<string> {
  const { data } = await context.supabase.from("perfis").select("nome").eq("id", context.userId).maybeSingle();
  return data?.nome ?? "(sem nome)";
}

export const registrarCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PosicaoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("registrar_checkin", {
      p_tipo: "checkin",
      p_latitude: data.latitude,
      p_longitude: data.longitude,
      p_precisao_metros: data.precisaoMetros ?? undefined,
    });
    if (error) throw new Error(error.message);
    const resultado = r as unknown as ResultadoCheckin;

    // Aviso ao monitor: não pode derrubar o check-in se o WhatsApp falhar.
    try {
      const numero = process.env.MONITOR_WHATSAPP;
      if (numero) {
        const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
        const nome = await nomeDoUsuario(context);
        const linhas = [
          "📍 *Check-in no plantão — Alexandria Leds*",
          `Corretor: ${nome}`,
          `Local: ${resultado.local_nome ?? "—"} (${textoDistancia(resultado.distancia_metros)} do ponto)`,
          `Quando: ${new Date(resultado.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          `Mapa: ${linkMapa(data.latitude, data.longitude)}`,
        ];
        await sendWhatsAppNotification(numero, linhas.join("\n"));
      }
    } catch (e) {
      console.error("[registrarCheckin] aviso ao monitor falhou", e);
    }

    return resultado;
  });

async function perfilAtual(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("perfis")
    .select("role, super_admin, empresa_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!data?.empresa_id) throw new Error("Seu perfil não está ligado a uma empresa.");
  return data as { role: string; super_admin: boolean; empresa_id: string };
}

export const listarCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dias: z.number().int().min(1).max(90).default(7) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const perfil = await perfilAtual(context);
    const desde = new Date(Date.now() - data.dias * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("checkins")
      .select("id, usuario_id, usuario_nome, tipo, local_nome, latitude, longitude, precisao_metros, distancia_metros, dentro_do_raio, created_at")
      .eq("empresa_id", perfil.empresa_id)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listarLocais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const perfil = await perfilAtual(context);
    const { data, error } = await context.supabase
      .from("locais_checkin")
      .select("id, nome, latitude, longitude, raio_metros, ativo")
      .eq("empresa_id", perfil.empresa_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function exigirMaster(context: { supabase: any; userId: string }) {
  const perfil = await perfilAtual(context);
  if (!(perfil.super_admin || perfil.role === "master")) throw new Error("Apenas o master pode gerenciar os locais.");
  return perfil;
}

const LocalInput = z.object({
  nome: z.string().trim().min(2, "Dê um nome com pelo menos 2 letras").max(80),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  raio_metros: z.number().int().min(20, "O raio mínimo é 20 m").max(5000, "O raio máximo é 5000 m"),
});

export const salvarLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LocalInput.parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirMaster(context);
    const { data: row, error } = await context.supabase
      .from("locais_checkin")
      .insert({ ...data, empresa_id: perfil.empresa_id })
      .select("id, nome, latitude, longitude, raio_metros, ativo")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const definirLocalAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirMaster(context);
    const { data: rows, error } = await context.supabase
      .from("locais_checkin")
      .update({ ativo: data.ativo })
      .eq("id", data.id)
      .eq("empresa_id", perfil.empresa_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Local não encontrado.");
    return { ok: true };
  });
