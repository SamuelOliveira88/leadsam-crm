// Ajuda das rotas /api/extensao/*: a extensão Mi Central entra com o MESMO login do Alexandria
// e manda o token (Bearer). Tudo roda com o cliente do próprio corretor, então o banco (RLS) decide o que ele vê.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

export function opcoes() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function autenticar(request: Request): Promise<{ sb: any; userId: string } | Response> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return resposta({ error: "Servidor sem configuração do banco." }, 500);
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return resposta({ error: "Entre com seu login do Alexandria." }, 401);
  const token = auth.slice(7);
  if (token.split(".").length !== 3) return resposta({ error: "Login inválido." }, 401);
  const sb = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return resposta({ error: "Sessão expirada. Entre de novo." }, 401);
  return { sb, userId: data.claims.sub };
}
