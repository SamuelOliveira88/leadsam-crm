// Resolve a empresa a partir de um token (tabela webhook_tokens ou tokens legados do ambiente).
export const EMPRESA_SAMUEL_IMOB = "1765d307-d778-48da-b96d-201ad7d7776c";
export const EMPRESA_EQUIPE_LAVILE_NOME = "Equipe Lavile";

export async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type TokenEmpresa = { empresa_id: string; origem: string };

/** Comparação em tempo constante (evita descobrir o token pelo tempo de resposta). */
export function iguaisSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** O token só é aceito no cabeçalho x-webhook-token (nunca na URL). */
export function tokenDoCabecalho(request: Request): string | null {
  const t = request.headers.get("x-webhook-token");
  return t && t.trim() ? t.trim() : null;
}

/** Gera um token novo (mostrado só uma vez) e o hash que vai para o banco. */
export async function gerarTokenWebhook(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = "wh_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash: await sha256Hex(token) };
}

/** legado: lista de [env, origem, empresa] mantida enquanto os tokens antigos existirem. */
async function legados(db: any): Promise<Array<{ token?: string; origem: string; empresa_id: string }>> {
  const { data: lavile } = await db.from("empresas").select("id").eq("nome", EMPRESA_EQUIPE_LAVILE_NOME).maybeSingle();
  const lav = lavile?.id as string | undefined;
  const lista = [
    { token: process.env.WEBHOOK_LEAD_TOKEN_SAMUELIMOB, origem: "samuelimob", empresa_id: EMPRESA_SAMUEL_IMOB },
    { token: process.env.REATIVACAO_API_KEY, origem: "reativacao", empresa_id: EMPRESA_SAMUEL_IMOB },
  ];
  if (lav) {
    lista.push(
      { token: process.env.WEBHOOK_LEAD_TOKEN, origem: "webhook", empresa_id: lav },
      { token: process.env.WEBHOOK_LEAD_TOKEN_LP, origem: "landing", empresa_id: lav },
      { token: process.env.WEBHOOK_LEAD_TOKEN_NOTIF, origem: "notificacoes", empresa_id: lav },
    );
  }
  return lista;
}

export async function resolverEmpresaPorToken(db: any, token: string | null | undefined, usos: string[] | null = null): Promise<TokenEmpresa | null> {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const { data } = await db.from("webhook_tokens").select("empresa_id, nome").eq("token_hash", hash).eq("ativo", true).maybeSingle();
  if (data?.empresa_id) return { empresa_id: data.empresa_id, origem: "webhook" };
  for (const l of await legados(db)) {
    if (l.token && iguaisSeguro(l.token, token) && (!usos || usos.includes(l.origem))) return { empresa_id: l.empresa_id, origem: l.origem };
  }
  return null;
}

/**
 * Teste de 7 dias: false quando a empresa está suspensa ou o teste venceu.
 * Se a função ainda não existir no banco (migration pendente), libera — nada quebra.
 */
export async function empresaLiberada(db: any, empresaId: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("empresa_liberada", { p_empresa_id: empresaId });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export const RESPOSTA_TESTE_ENCERRADO = { erro: "teste encerrado ou empresa suspensa" };
