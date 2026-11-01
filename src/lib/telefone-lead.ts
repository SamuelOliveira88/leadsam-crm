// A2 (revisão 01/11): o banco não deixa mais o login do usuário ler leads.telefone direto.
// O número vem da função telefones_dos_leads(), que aplica a regra no banco:
//   super admin, master da empresa, gerente do grupo, criador do lead privado e o corretor dono
//   quando o lead NÃO é blindado (número mãe, ou lista com a chave ligada).
// Com o cliente service_role (servidor/cron) a função devolve todos os pedidos.
// Estas funções só recebem o cliente Supabase já criado; não têm segredo nem código de servidor.

/** Mapa lead_id -> telefone, só com os leads que quem pede pode ver. */
export async function telefonesDosLeads(sb: any, ids: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  const mapa = new Map<string, string | null>();
  for (let i = 0; i < unicos.length; i += 1000) {
    const lote = unicos.slice(i, i + 1000);
    const { data, error } = await sb.rpc("telefones_dos_leads", { p_ids: lote });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ lead_id: string; telefone: string | null }>) mapa.set(r.lead_id, r.telefone);
  }
  return mapa;
}

/** Acrescenta `telefone` (ou null, quando não pode ver) em cada linha que tem `id` de lead. */
export async function comTelefone<T extends Record<string, any>>(sb: any, linhas: T[], campoId: keyof T = "id"): Promise<Array<T & { telefone: string | null }>> {
  const mapa = await telefonesDosLeads(sb, linhas.map((l) => l?.[campoId] as string | undefined));
  return linhas.map((l) => ({ ...l, telefone: mapa.get(l?.[campoId] as string) ?? null }));
}

/** Telefone de um lead só (ou null). */
export async function telefoneDoLead(sb: any, leadId: string | null | undefined): Promise<string | null> {
  if (!leadId) return null;
  const mapa = await telefonesDosLeads(sb, [leadId]);
  return mapa.get(leadId) ?? null;
}
