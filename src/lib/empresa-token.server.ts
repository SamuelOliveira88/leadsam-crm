// Resolve a empresa a partir de um token (tabela webhook_tokens ou tokens legados do ambiente).
export const EMPRESA_SAMUEL_IMOB = "1765d307-d778-48da-b96d-201ad7d7776c";
export const EMPRESA_EQUIPE_LAVILE_NOME = "Equipe Lavile";

export async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type TokenEmpresa = { empresa_id: string; origem: string };

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
    if (l.token && l.token === token && (!usos || usos.includes(l.origem))) return { empresa_id: l.empresa_id, origem: l.origem };
  }
  return null;
}
