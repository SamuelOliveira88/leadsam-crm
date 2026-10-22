// Leads que chegam pelo número mãe: o corretor atende pela tela Conversas e NÃO vê o telefone do cliente.
// Master, gerente e super admin continuam vendo. Estas funções são puras (sem código de servidor).

export const FONTE_NUMERO_MAE = "numero_mae";
export const FONTE_LISTA = "planilha_samuelimob";
// Origens em que o corretor conversa pela tela Conversas e não vê o telefone.
const FONTES_SEM_TELEFONE = [FONTE_NUMERO_MAE, FONTE_LISTA];

export function ehNumeroMae(l: { fonte?: string | null } | null | undefined): boolean {
  return !!l?.fonte && FONTES_SEM_TELEFONE.includes(l.fonte);
}

/** Corretor "comum": quem não é master, gerente nem super admin. */
export function perfilEhCorretor(p: { role?: string | null; super_admin?: boolean | null } | null | undefined): boolean {
  return p?.role === "corretor" && !p?.super_admin;
}

/** Quando o cliente não tem nome no WhatsApp o nome vira o próprio número: esconde também. */
export function nomeSemNumero(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  return n.replace(/\D/g, "").length >= 8 || n.startsWith("sem-numero-") ? "Cliente sem nome" : n || "Cliente";
}

export function leadSemTelefone<T extends { nome?: string | null; telefone?: string | null }>(l: T): T {
  return { ...l, telefone: null, nome: nomeSemNumero(l.nome) };
}

export async function souCorretorPuro(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("perfis").select("role, super_admin").eq("id", userId).maybeSingle();
  return perfilEhCorretor(data as any);
}
