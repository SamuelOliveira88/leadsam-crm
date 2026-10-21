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
      .select("id, usuario_id, usuario_nome, tipo, local_nome, latitude, longitude, precisao_metros, distancia_metros, dentro_do_raio, metodo, created_at")
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
      .select("id, nome, latitude, longitude, raio_metros, ativo, usa_gps, usa_ip, ip_fixo, qr_codigo")
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

const IpFixo = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F:.]{3,45}$/, "IP inválido");

const LocalInput = z
  .object({
    nome: z.string().trim().min(2, "Dê um nome com pelo menos 2 letras").max(80),
    usa_gps: z.boolean().default(true),
    usa_ip: z.boolean().default(false),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    raio_metros: z.number().int().min(20, "O raio mínimo é 20 m").max(5000, "O raio máximo é 5000 m").default(150),
    ip_fixo: IpFixo.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.usa_gps && !v.usa_ip) ctx.addIssue({ code: "custom", message: "Escolha ao menos um método: localização ou IP fixo." });
    if (v.usa_gps && (v.latitude == null || v.longitude == null))
      ctx.addIssue({ code: "custom", message: "Informe a latitude e a longitude (ou use a localização atual)." });
    if (v.usa_ip && !v.ip_fixo) ctx.addIssue({ code: "custom", message: "Informe o IP fixo do ponto." });
  });

const CAMPOS_LOCAL = "id, nome, latitude, longitude, raio_metros, ativo, usa_gps, usa_ip, ip_fixo, qr_codigo";

function paraBanco(d: z.infer<typeof LocalInput>) {
  return {
    nome: d.nome,
    usa_gps: d.usa_gps,
    usa_ip: d.usa_ip,
    latitude: d.usa_gps ? d.latitude ?? null : null,
    longitude: d.usa_gps ? d.longitude ?? null : null,
    raio_metros: d.raio_metros,
    ip_fixo: d.usa_ip ? d.ip_fixo ?? null : null,
  };
}

export const salvarLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LocalInput.parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirMaster(context);
    const { data: row, error } = await context.supabase
      .from("locais_checkin")
      .insert({ ...paraBanco(data), empresa_id: perfil.empresa_id })
      .select(CAMPOS_LOCAL)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Editar nome, métodos, coordenadas e IP de um ponto. O QR NÃO muda por aqui.
export const atualizarLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), dados: LocalInput }).parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirMaster(context);
    const { data: rows, error } = await context.supabase
      .from("locais_checkin")
      .update(paraBanco(data.dados))
      .eq("id", data.id)
      .eq("empresa_id", perfil.empresa_id)
      .select(CAMPOS_LOCAL);
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Ponto não encontrado.");
    return rows[0];
  });

// Troca o QR de um ponto (QR antigo deixa de valer). Só de propósito, com confirmação na tela.
export const regerarQrLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirMaster(context);
    const { data: codigo, error } = await context.supabase.rpc("regerar_qr_local", { p_id: data.id });
    if (error) throw new Error(error.message);
    return { qr_codigo: codigo as unknown as string };
  });

// Dados públicos mínimos de um ponto, a partir do código do QR (só quem é da mesma empresa enxerga).
export const pontoPorCodigo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ codigo: z.string().regex(/^[0-9a-f]{32}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("locais_checkin")
      .select("id, nome, ativo, usa_gps, usa_ip")
      .eq("qr_codigo", data.codigo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

// Check-in pelo QR do ponto. O IP é lido aqui, no servidor; o resto é conferido no banco.
export const registrarCheckinPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ codigo: z.string().regex(/^[0-9a-f]{32}$/), posicao: PosicaoInput.optional().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ponto } = await context.supabase
      .from("locais_checkin")
      .select("id")
      .eq("qr_codigo", data.codigo)
      .maybeSingle();
    if (!ponto) throw new Error("QR inválido ou de outra imobiliária.");

    // Lê o IP aqui dentro (import dinâmico) para o código de servidor não ir para o navegador.
    const { getRequest } = await import("@tanstack/react-start/server");
    const cab = getRequest()?.headers;
    const ipDaRequisicao = (): string | null => {
      if (!cab) return null;
      const cf = cab.get("cf-connecting-ip");
      if (cf) return cf.trim();
      const real = cab.get("x-real-ip");
      if (real) return real.trim();
      const xff = cab.get("x-forwarded-for");
      return xff ? xff.split(",")[0].trim() : null;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin as any).rpc("registrar_checkin_ponto", {
      p_usuario_id: context.userId,
      p_local_id: ponto.id,
      p_ip: ipDaRequisicao(),
      p_latitude: data.posicao?.latitude ?? null,
      p_longitude: data.posicao?.longitude ?? null,
      p_precisao_metros: data.posicao?.precisaoMetros ?? null,
    });
    if (error) throw new Error(error.message);
    const resultado = r as ResultadoCheckin & { metodo: string };

    try {
      const numero = process.env.MONITOR_WHATSAPP;
      if (numero) {
        const { sendWhatsAppNotification } = await import("@/lib/evolution.server");
        const nome = await nomeDoUsuario(context);
        const linhas = [
          "📍 *Check-in por QR — Alexandria Leds*",
          `Corretor: ${nome}`,
          `Ponto: ${resultado.local_nome ?? "—"} (${resultado.metodo})`,
          `Quando: ${new Date(resultado.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        ];
        await sendWhatsAppNotification(numero, linhas.join("\n"));
      }
    } catch (e) {
      console.error("[registrarCheckinPonto] aviso ao monitor falhou", e);
    }
    return resultado;
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
