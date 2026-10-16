import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";

async function minhaEmpresaId(context: any): Promise<string> {
  const { data } = await context.supabase
    .from("perfis").select("empresa_id").eq("id", context.userId).maybeSingle();
  if (!data?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
  return data.empresa_id;
}

export const getConfigAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { data, error } = await context.supabase
      .from("config_acesso")
      .select("restringir_horario, hora_inicio, hora_fim, liberado_ate, restringir_ip, ips_permitidos, restringir_local")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (error) throw error;
    return data ?? { restringir_horario: false, hora_inicio: "08:00:00", hora_fim: "09:30:00", liberado_ate: null, restringir_ip: false, ips_permitidos: [] as string[], restringir_local: false };
  });

export const salvarConfigAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    restringir_horario: boolean;
    hora_inicio: string;
    hora_fim: string;
    liberado_ate: string | null;
    restringir_ip?: boolean;
    ips_permitidos?: string[];
    restringir_local?: boolean;
  }) => z.object({
    restringir_horario: z.boolean(),
    hora_inicio: z.string(),
    hora_fim: z.string(),
    liberado_ate: z.string().nullable(),
    restringir_ip: z.boolean().optional(),
    ips_permitidos: z.array(z.string().trim().min(3).max(45).regex(/^[0-9a-fA-F:.]+$/, "IP inválido")).max(20).optional(),
    restringir_local: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, ...data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });

export const liberarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { minutos: number }) => z.object({ minutos: z.number().int().min(5).max(24 * 60) }).parse(d))
  .handler(async ({ data, context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const ate = new Date(Date.now() + data.minutos * 60_000).toISOString();
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, liberado_ate: ate, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { liberado_ate: ate };
  });

export const revogarLiberacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, liberado_ate: null, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });

function ipDaRequisicao(): string | null {
  const h = getRequest()?.headers;
  if (!h) return null;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return null;
}

export const meuIpAtual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ ip: ipDaRequisicao() }));

// Decide no servidor se este usuário pode entrar agora (trava por IP e/ou por local).
// Master e super admin nunca são barrados. Liberações temporárias (da empresa ou pessoal) valem.
export const verificarAcessoRemoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    posicao: z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      precisaoMetros: z.number().finite().min(0).max(100000).optional().nullable(),
    }).optional().nullable(),
  }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const { data: perfilRaw } = await (context.supabase as any)
      .from("perfis").select("role, empresa_id, super_admin, liberado_ate").eq("id", context.userId).maybeSingle();
    const perfil = perfilRaw as { role?: string; empresa_id?: string; super_admin?: boolean; liberado_ate?: string | null } | null;
    const ok = { permitido: true as boolean, motivo: null as null | "ip" | "local_sem_gps" | "local_fora", ip: ipDaRequisicao() };
    if (!perfil?.empresa_id || perfil.role === "master" || (perfil as any).super_admin) return ok;
    const lib = (perfil as any).liberado_ate;
    if (lib && new Date(lib).getTime() > Date.now()) return ok;

    const { data: cfg } = await context.supabase
      .from("config_acesso")
      .select("liberado_ate, restringir_ip, ips_permitidos, restringir_local")
      .eq("empresa_id", perfil.empresa_id).maybeSingle();
    if (!cfg) return ok;
    if (cfg.liberado_ate && new Date(cfg.liberado_ate).getTime() > Date.now()) return ok;

    if (cfg.restringir_ip) {
      const lista = (cfg.ips_permitidos ?? []).map((x: string) => x.trim().toLowerCase());
      if (!ok.ip || !lista.includes(ok.ip.toLowerCase())) return { ...ok, permitido: false, motivo: "ip" as const };
    }
    if (cfg.restringir_local) {
      const { data: locais } = await context.supabase
        .from("locais_checkin").select("latitude, longitude, raio_metros")
        .eq("empresa_id", perfil.empresa_id).eq("ativo", true);
      if (locais && locais.length > 0) {
        const p = data?.posicao;
        if (!p) return { ...ok, permitido: false, motivo: "local_sem_gps" as const };
        const { dentroDoRaio } = await import("@/lib/geo");
        const dentro = locais.some((l: any) =>
          dentroDoRaio(
            { latitude: p.latitude, longitude: p.longitude, precisaoMetros: p.precisaoMetros ?? 0, capturadaEm: new Date().toISOString() },
            { latitude: l.latitude, longitude: l.longitude, raioMetros: l.raio_metros },
          ).dentro);
        if (!dentro) return { ...ok, permitido: false, motivo: "local_fora" as const };
      }
    }
    return ok;
  });
