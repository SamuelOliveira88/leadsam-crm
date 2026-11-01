// Testes das rotas reais (handlers do TanStack), com o Supabase trocado por um falso em memória.
import { describe, expect, test, mock } from "bun:test";
import { sha256Hex } from "../src/lib/empresa-token.server";

const EMP = "11111111-1111-1111-1111-111111111111";
const TOKENS: Record<string, { uso: string }> = { wh_landing: { uso: "lead" }, wh_reativ: { uso: "reativacao" } };
const hashes: Record<string, string> = {};
for (const t of Object.keys(TOKENS)) hashes[await sha256Hex(t)] = t;

const chamadasRpc: Array<{ nome: string; args: any }> = [];
const whatsappsEnviados: string[] = [];
let limites: Record<string, number> = {};

function consulta(tabela: string) {
  const f: Record<string, unknown> = {};
  const q: any = {
    select() { return q; }, eq(c: string, v: unknown) { f[c] = v; return q; }, order() { return q; }, not() { return q; }, ilike() { return q; },
    range() { return Promise.resolve({ data: tabela === "leads" ? [{ nome: "Cliente Frio", telefone: "5511999990000", empreendimento_interesse: null }] : [], error: null }); },
    async maybeSingle() {
      if (tabela === "webhook_tokens") {
        const t = hashes[f.token_hash as string];
        return { data: t ? { empresa_id: EMP, nome: t, uso: TOKENS[t].uso } : null };
      }
      return { data: null };
    },
    insert() { return Promise.resolve({ error: null }); },
  };
  return q;
}
const supabaseAdmin = {
  from: (t: string) => consulta(t),
  async rpc(nome: string, args: any) {
    chamadasRpc.push({ nome, args });
    if (nome === "empresa_liberada") return { data: true, error: null };
    if (nome === "consumir_limite") {
      const k = args.p_chave; limites[k] = (limites[k] ?? 0) + 1;
      return { data: limites[k] <= args.p_max, error: null };
    }
    return { data: null, error: null };
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
mock.module("@/lib/evolution.server", () => ({
  sendWhatsAppNotification: async (numero: string) => { whatsappsEnviados.push(numero); return { ok: true }; },
  processarLembretesDeCompromisso: async () => ({}),
  processarNotificacoesWhatsAppPendentes: async () => ({ enviados: 0 }),
}));

const { Route: Reativacao } = await import("../src/routes/api/public/reativacao");
const { Route: ChatMia } = await import("../src/routes/api/public/chat-mia");
const { Route: Fila } = await import("../src/routes/api/public/hooks/processar-fila");
const h = (r: any) => r.options.server.handlers;

describe("C2 na rota /api/public/reativacao", () => {
  test("token da landing page -> 401 (não lê a base)", async () => {
    const res = await h(Reativacao).GET({ request: new Request("https://x/api/public/reativacao?limit=500", { headers: { "x-webhook-token": "wh_landing" } }) });
    expect(res.status).toBe(401);
  });
  test("token de reativação -> 200 com os leads frios", async () => {
    const res = await h(Reativacao).GET({ request: new Request("https://x/api/public/reativacao", { headers: { "x-webhook-token": "wh_reativ" } }) });
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(1);
  });
  test("sem CORS aberto (navegador não lê a resposta)", async () => {
    const res = await h(Reativacao).GET({ request: new Request("https://x/api/public/reativacao", { headers: { "x-webhook-token": "wh_reativ" } }) });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("A5 no chat da página de vendas", () => {
  test("pedido de contato: NÃO manda WhatsApp para o número digitado; só avisa o dono", async () => {
    whatsappsEnviados.length = 0; limites = {};
    delete process.env.CHAT_CONVITE_AUTOMATICO;
    process.env.DONO_WHATSAPP = "5511932368278";
    const res = await h(ChatMia).POST({ request: new Request("https://x/api/public/chat-mia", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "9.9.9.9" },
      body: JSON.stringify({ acao: "lead", nome: "Fulano Teste", whatsapp: "11 98888-7777" }) }) });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(whatsappsEnviados).toEqual(["5511932368278"]);
    expect(j.link).toBeNull();
    expect(j.whatsapp_link).toStartWith("https://wa.me/5511932368278");
  });
  test("o limite fica no banco (consumir_limite) e corta a repetição do mesmo número", async () => {
    const res = await h(ChatMia).POST({ request: new Request("https://x/api/public/chat-mia", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "8.8.8.8" },
      body: JSON.stringify({ acao: "lead", nome: "Fulano Teste", whatsapp: "11 98888-7777" }) }) });
    expect(res.status).toBe(429);
    expect(chamadasRpc.some((c) => c.nome === "consumir_limite" && c.args.p_chave === "chat-lead:tel:11988887777")).toBe(true);
  });
  test("mesmo IP: 4ª tentativa na hora -> 429", async () => {
    limites = {};
    const st: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await h(ChatMia).POST({ request: new Request("https://x/api/public/chat-mia", {
        method: "POST", headers: { "content-type": "application/json", "x-real-ip": "7.7.7.7" },
        body: JSON.stringify({ acao: "lead", nome: "Pessoa " + i, whatsapp: "1197777000" + i }) }) });
      st.push(res.status);
    }
    expect(st).toEqual([200, 200, 200, 429]);
  });
  test("se o banco do limite falhar, nega (não vira spam)", async () => {
    const original = supabaseAdmin.rpc;
    (supabaseAdmin as any).rpc = async () => ({ data: null, error: { message: "fora do ar" } });
    const res = await h(ChatMia).POST({ request: new Request("https://x/api/public/chat-mia", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "6.6.6.6" },
      body: JSON.stringify({ acao: "lead", nome: "Fulano", whatsapp: "11966665555" }) }) });
    (supabaseAdmin as any).rpc = original;
    expect(res.status).toBe(429);
  });
});

describe("A3/M6 na rota do cron (processar-fila)", () => {
  test("token na URL (?token=) não é mais aceito", async () => {
    process.env.CRON_TOKEN = "cron-token-de-teste-1234567890";
    const res = await h(Fila).POST({ request: new Request("https://x/api/public/hooks/processar-fila?token=cron-token-de-teste-1234567890", { method: "POST" }) });
    expect(res.status).toBe(401);
  });
  test("token errado no cabeçalho -> 401", async () => {
    const res = await h(Fila).POST({ request: new Request("https://x/api/public/hooks/processar-fila", { method: "POST", headers: { "x-webhook-token": "errado" } }) });
    expect(res.status).toBe(401);
  });
  test("CRON_TOKEN certo no cabeçalho passa da autenticação", async () => {
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await h(Fila).POST({ request: new Request("https://x/api/public/hooks/processar-fila", { method: "POST", headers: { "x-webhook-token": "cron-token-de-teste-1234567890" } }) });
    expect(res.status).toBe(500); // passou do 401; parou em "Config ausente" porque o teste não tem Supabase
    expect((await res.json()).error).toBe("Config ausente");
  });
});
