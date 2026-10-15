// Deduplicação de leads por telefone dentro da mesma empresa — server-only.

export const JANELA_DEDUP_DIAS = 30;

/** Só os dígitos do telefone. */
export function somenteDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Chave de comparação: os últimos 9 dígitos (celular BR sem DDD/DDI).
 * Assim "(11) 98888-7777", "11988887777" e "+55 11 98888-7777" se igualam.
 * Telefones curtos (fixo sem DDD etc.) comparam inteiros.
 */
export function chaveTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length < 8) return "";
  return d.length > 9 ? d.slice(-9) : d;
}

export type LeadDuplicado = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  corretor_id: string | null;
  grupo_id: string | null;
};

/** Procura, na MESMA empresa, um lead com o mesmo telefone criado nos últimos N dias. */
export async function buscarLeadDuplicado(
  db: any,
  empresaId: string,
  telefone: string | null | undefined,
  dias = JANELA_DEDUP_DIAS,
): Promise<LeadDuplicado | null> {
  const chave = chaveTelefone(telefone);
  if (!chave) return null;

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("leads")
    .select("id, nome, email, telefone, corretor_id, grupo_id")
    .eq("empresa_id", empresaId)
    .gte("created_at", desde)
    .not("telefone", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  return ((data ?? []) as LeadDuplicado[]).find((l) => chaveTelefone(l.telefone) === chave) ?? null;
}

/**
 * Atualiza o lead existente com a nova entrada: completa e-mail se faltava,
 * marca atividade recente e registra a entrada nas notas.
 */
export async function registrarReentrada(
  db: any,
  lead: LeadDuplicado,
  empresaId: string,
  entrada: { nome?: string | null; email?: string | null; observacoes?: string | null; fonte: string },
): Promise<void> {
  const agora = new Date().toISOString();

  const patch: Record<string, unknown> = {
    ultima_atividade: "Entrou novamente",
    ultima_atividade_em: agora,
  };
  if (!lead.email && entrada.email) patch.email = entrada.email;

  const { error: erroUpdate } = await db.from("leads").update(patch).eq("id", lead.id).eq("empresa_id", empresaId);
  if (erroUpdate) throw new Error(erroUpdate.message);

  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linhas = [`Novo contato recebido em ${quando} (origem: ${entrada.fonte}).`];
  if (entrada.nome && entrada.nome !== lead.nome) linhas.push(`Nome informado desta vez: ${entrada.nome}`);
  if (entrada.observacoes) linhas.push(entrada.observacoes);

  const { error: erroNota } = await db.from("lead_notas").insert({
    lead_id: lead.id,
    empresa_id: empresaId,
    autor_id: null,
    texto: linhas.join("\n"),
  });
  if (erroNota) throw new Error(erroNota.message);
}
