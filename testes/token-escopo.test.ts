// Testes de código (bun test): escopo do token (C2) e helper de telefone (A2).
import { describe, expect, test, beforeEach } from "bun:test";
import { resolverEmpresaPorToken, sha256Hex } from "../src/lib/empresa-token.server";
import { comTelefone, telefoneDoLead } from "../src/lib/telefone-lead";

type Tok = { token: string; empresa_id: string; nome: string; uso: string; ativo: boolean };

function dbFalso(tokens: Tok[]) {
  return {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q: any = {
        select() { return q; },
        eq(c: string, v: unknown) { filtros[c] = v; return q; },
        async maybeSingle() {
          if (tabela === "empresas") return { data: null };
          for (const t of tokens) {
            if ((await sha256Hex(t.token)) === filtros.token_hash && t.ativo === filtros.ativo) {
              return { data: { empresa_id: t.empresa_id, nome: t.nome, uso: t.uso } };
            }
          }
          return { data: null };
        },
      };
      return q;
    },
  };
}

const EMP = "11111111-1111-1111-1111-111111111111";
const tokens: Tok[] = [
  { token: "wh_landing", empresa_id: EMP, nome: "Landing page Vista", uso: "lead", ativo: true },
  { token: "wh_reativ", empresa_id: EMP, nome: "n8n reativação", uso: "reativacao", ativo: true },
  { token: "wh_email", empresa_id: EMP, nome: "e-mail portais", uso: "email", ativo: true },
  { token: "wh_elo", empresa_id: EMP, nome: "elo-whatsapp", uso: "elo", ativo: true },
  { token: "wh_desligado", empresa_id: EMP, nome: "velho", uso: "reativacao", ativo: false },
];
const db = dbFalso(tokens);

describe("C2: token com escopo por rota", () => {
  beforeEach(() => {
    delete process.env.REATIVACAO_API_KEY;
    delete process.env.WEBHOOK_LEAD_TOKEN_SAMUELIMOB;
  });
  test("token da landing page cria lead no /webhook", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_landing", ["lead", "email"])).toEqual({ empresa_id: EMP, origem: "webhook" });
  });
  test("token da landing page NÃO abre /api/public/reativacao", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_landing", ["reativacao"])).toBeNull();
  });
  test("token da landing page NÃO abre o elo", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_landing", ["elo"])).toBeNull();
  });
  test("token de reativação abre /reativacao", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_reativ", ["reativacao"])).not.toBeNull();
  });
  test("token de reativação NÃO cria lead pelo /webhook", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_reativ", ["lead", "email"])).toBeNull();
  });
  test("token de e-mail funciona no /lead-email e no /webhook (que ele chama), não na reativação", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_email", ["email", "lead"])).not.toBeNull();
    expect(await resolverEmpresaPorToken(db, "wh_email", ["lead", "email"])).not.toBeNull();
    expect(await resolverEmpresaPorToken(db, "wh_email", ["reativacao"])).toBeNull();
  });
  test("token do elo só no elo", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_elo", ["elo"])).not.toBeNull();
    expect(await resolverEmpresaPorToken(db, "wh_elo", ["reativacao"])).toBeNull();
  });
  test("token desativado não vale", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_desligado", ["reativacao"])).toBeNull();
  });
  test("sem lista de usos, nada vale", async () => {
    expect(await resolverEmpresaPorToken(db, "wh_reativ", [] as any)).toBeNull();
  });
  test("legado: REATIVACAO_API_KEY só na reativação; WEBHOOK_LEAD_TOKEN_SAMUELIMOB só cria lead", async () => {
    process.env.REATIVACAO_API_KEY = "legado-reativacao-123456";
    process.env.WEBHOOK_LEAD_TOKEN_SAMUELIMOB = "legado-lead-samuel-123456";
    expect(await resolverEmpresaPorToken(db, "legado-reativacao-123456", ["reativacao"])).not.toBeNull();
    expect(await resolverEmpresaPorToken(db, "legado-reativacao-123456", ["lead", "email"])).toBeNull();
    expect(await resolverEmpresaPorToken(db, "legado-lead-samuel-123456", ["lead", "email"])).not.toBeNull();
    expect(await resolverEmpresaPorToken(db, "legado-lead-samuel-123456", ["reativacao"])).toBeNull();
  });
});

describe("A2: telefone vem da função do banco", () => {
  const sbFalso = (permitidos: Record<string, string>) => ({
    async rpc(nome: string, args: any) {
      expect(nome).toBe("telefones_dos_leads");
      return { data: (args.p_ids as string[]).filter((i) => permitidos[i]).map((i) => ({ lead_id: i, telefone: permitidos[i] })), error: null };
    },
  });
  test("preenche quem pode ver e põe null no resto", async () => {
    const r = await comTelefone(sbFalso({ a: "5511911110001" }), [{ id: "a", nome: "A" }, { id: "b", nome: "B" }]);
    expect(r).toEqual([{ id: "a", nome: "A", telefone: "5511911110001" }, { id: "b", nome: "B", telefone: null }]);
  });
  test("telefoneDoLead sem id devolve null", async () => {
    expect(await telefoneDoLead(sbFalso({}), null)).toBeNull();
  });
  test("erro do banco sobe (não engole)", async () => {
    const sb = { async rpc() { return { data: null, error: { message: "permission denied" } }; } };
    await expect(comTelefone(sb, [{ id: "a" }])).rejects.toThrow("permission denied");
  });
});
