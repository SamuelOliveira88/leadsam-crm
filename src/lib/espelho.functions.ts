import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarEmpreendimentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("empreendimentos")
      .select("id, nome, incorporadora, cidade, ativo, grupo_id")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const EmpreendimentoInput = z.object({
  nome: z.string().min(1),
  incorporadora: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  grupo_id: z.string().uuid().optional().nullable(),
});

export const criarEmpreendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EmpreendimentoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp, error } = await context.supabase
      .from("empreendimentos")
      .insert({
        nome: data.nome,
        incorporadora: data.incorporadora ?? null,
        cidade: data.cidade ?? null,
        grupo_id: data.grupo_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return emp;
  });

export const listarUnidades = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ empreendimento_id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: unidades, error } = await context.supabase
      .from("unidades")
      .select("id, torre, andar, numero, tipologia, area_m2, valor, status, corretor_id, lead_id, cliente_nome, reservado_em, observacoes, corretores(nome)")
      .eq("empreendimento_id", data.empreendimento_id)
      .order("torre", { ascending: true })
      .order("andar", { ascending: false })
      .order("numero", { ascending: true });
    if (error) throw new Error(error.message);
    return unidades ?? [];
  });

// ============ CADASTRO EM LOTE ============
// Gera automaticamente todas as unidades de uma torre (ex: 12 andares x 4 unidades/andar = 48 unidades)
const UnidadesLoteInput = z.object({
  empreendimento_id: z.string().uuid(),
  torre: z.string().min(1),
  andar_inicial: z.number().int().min(0),
  andar_final: z.number().int().min(0),
  unidades_por_andar: z.number().int().min(1).max(20),
  tipologia: z.string().optional().nullable(),
  area_m2: z.number().optional().nullable(),
  valor: z.number().optional().nullable(),
});

export const criarUnidadesLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UnidadesLoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const linhas: any[] = [];
    const andarInicio = Math.min(data.andar_inicial, data.andar_final);
    const andarFim = Math.max(data.andar_inicial, data.andar_final);
    for (let andar = andarInicio; andar <= andarFim; andar++) {
      for (let pos = 1; pos <= data.unidades_por_andar; pos++) {
        const numero = `${andar}${String(pos).padStart(2, "0")}`;
        linhas.push({
          empreendimento_id: data.empreendimento_id,
          torre: data.torre,
          andar,
          numero,
          tipologia: data.tipologia ?? null,
          area_m2: data.area_m2 ?? null,
          valor: data.valor ?? null,
          status: "disponivel",
        });
      }
    }
    const { error } = await context.supabase.from("unidades").upsert(linhas, {
      onConflict: "empreendimento_id,torre,numero",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    return { criadas: linhas.length };
  });

const AtualizarUnidadeInput = z.object({
  id: z.string().uuid(),
  tipologia: z.string().optional().nullable(),
  area_m2: z.number().optional().nullable(),
  valor: z.number().optional().nullable(),
  status: z.enum(["disponivel", "reservada", "vendida", "bloqueada"]).optional(),
  observacoes: z.string().optional().nullable(),
});

export const atualizarUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AtualizarUnidadeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...campos } = data;
    const { error } = await context.supabase.from("unidades").update(campos).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("unidades").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ RESERVA (via RPC transacional) ============
const ReservarInput = z.object({
  unidade_id: z.string().uuid(),
  lead_id: z.string().uuid().optional().nullable(),
  cliente_nome: z.string().optional().nullable(),
});

export const reservarUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReservarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reservar_unidade", {
      p_unidade_id: data.unidade_id,
      p_lead_id: data.lead_id ?? undefined,
      p_cliente_nome: data.cliente_nome ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const liberarUnidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ unidade_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("liberar_unidade", { p_unidade_id: data.unidade_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
