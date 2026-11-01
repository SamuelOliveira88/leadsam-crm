// C3/M2: cadastrarCorretorComSenha e redefinirSenhaCorretor com o Supabase falso.
// O createServerFn é trocado por um "capturador" para chamar o handler direto.
import { describe, expect, test, mock, beforeEach } from "bun:test";

mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const c: any = { _v: (d: unknown) => d };
    c.middleware = () => c;
    c.inputValidator = (v: any) => { c._v = v; return c; };
    c.handler = (fn: any) => ({ chamar: (data: unknown, context: unknown) => fn({ data: c._v(data), context }) });
    return c;
  },
}));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const EMP_A = "11111111-1111-1111-1111-111111111111";
const EMP_B = "22222222-2222-2222-2222-222222222222";
const GRUPO_A = "a0000000-0000-0000-0000-00000000000a";
const GRUPO_B = "b0000000-0000-0000-0000-00000000000b";
const SUPER = "99999999-0000-0000-0000-000000000009";

let log: string[] = [];
let existentes: Record<string, string> = {};   // email -> user id
let perfis: Record<string, any> = {};
let corretores: Record<string, any> = {};
let grupos: Record<string, any> = { [GRUPO_A]: { empresa_id: EMP_A }, [GRUPO_B]: { empresa_id: EMP_B } };

function tabela(nome: string) {
  const f: Record<string, unknown> = {};
  let op = "select"; let payload: any = null;
  const q: any = {
    select() { return q; },
    eq(c: string, v: unknown) { f[c] = v; return q; },
    insert(p: any) { op = "insert"; payload = p; log.push(`insert:${nome}`); return q; },
    update(p: any) { op = "update"; payload = p; log.push(`update:${nome}:${JSON.stringify(p)}`); return q; },
    upsert(p: any) { log.push(`upsert:${nome}`); perfis[p.id] = { ...(perfis[p.id] ?? {}), ...p }; return Promise.resolve({ error: null }); },
    async maybeSingle() { return q.single(); },
    async single() {
      if (op === "insert") return { data: { id: nome === "corretores" ? "corr-novo" : "conv-1" }, error: null };
      if (nome === "grupos") return { data: grupos[f.id as string] ?? null };
      if (nome === "perfis") return { data: perfis[f.id as string] ?? null };
      if (nome === "corretores") return { data: corretores[f.id as string] ?? null };
      return { data: null };
    },
    then(r: any) { return Promise.resolve({ error: null }).then(r); },
  };
  return q;
}
const supabaseAdmin = {
  from: tabela,
  auth: {
    admin: {
      async createUser(o: any) {
        log.push(`createUser:${o.email}`);
        if (existentes[o.email]) return { data: null, error: { code: "email_exists", message: "A user with this email address has already been registered" } };
        return { data: { user: { id: "novo-user" } }, error: null };
      },
      async updateUserById() { log.push("updateUserById"); return { error: null }; },
      async generateLink(o: any) { log.push(`generateLink:${o.type}:${o.email}`); return { data: { properties: { action_link: "https://proj.supabase.co/auth/v1/verify?token=xyz&type=recovery" } }, error: null }; },
      async getUserById(id: string) { return { data: { user: { email: Object.keys(existentes).find((e) => existentes[e] === id) } } }; },
    },
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const m: any = await import("../src/lib/corretores.functions");
const cadastrar = (data: any, perfil: any) =>
  m.cadastrarCorretorComSenha.chamar(data, { userId: "quem-chama", supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: perfil }) }) }) }) } });
const redefinir = (data: any, perfil: any) =>
  m.redefinirSenhaCorretor.chamar(data, { userId: "quem-chama", supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: perfil }) }) }) }) } });

const MASTER_A = { role: "master", super_admin: false, acesso_total: true, empresa_id: EMP_A, grupo_id: GRUPO_A };

beforeEach(() => {
  log = [];
  existentes = { "samuel@exemplo.com": SUPER, "ana@x.com": "user-ana" };
  perfis = { [SUPER]: { role: "master", super_admin: true, acesso_total: true, empresa_id: null }, "user-ana": { role: "corretor", super_admin: false, acesso_total: false, empresa_id: EMP_A } };
  corretores = {
    "c0000000-0000-0000-0000-0000000000a1": { id: "c0000000-0000-0000-0000-0000000000a1", user_id: "user-ana", nome: "Ana", empresa_id: EMP_A, grupo_id: GRUPO_A },
    "c0000000-0000-0000-0000-0000000000ff": { id: "c0000000-0000-0000-0000-0000000000ff", user_id: SUPER, nome: "Isca", empresa_id: EMP_A, grupo_id: GRUPO_A },
    "c0000000-0000-0000-0000-0000000000b1": { id: "c0000000-0000-0000-0000-0000000000b1", user_id: "user-b", nome: "Beto", empresa_id: EMP_B, grupo_id: GRUPO_B },
  };
  perfis["user-b"] = { role: "corretor", super_admin: false, acesso_total: false, empresa_id: EMP_B };
  existentes["beto@b.com"] = "user-b";
});

describe("C3: cadastrarCorretorComSenha", () => {
  test("e-mail que já existe (ex.: do super admin) é recusado e a senha NÃO é trocada", async () => {
    await expect(cadastrar({ nome: "X", email: "samuel@exemplo.com", grupo_id: GRUPO_A }, MASTER_A)).rejects.toThrow("já tem conta");
    expect(log).not.toContain("updateUserById");
    expect(log.some((l) => l.startsWith("upsert:perfis"))).toBe(false);          // não rebaixa o perfil
    expect(log.some((l) => l.startsWith("update:convites_admin"))).toBe(true);   // fecha o convite que abriu
    expect(perfis[SUPER].super_admin).toBe(true);
  });
  test("usuário novo: cria, NÃO devolve senha, devolve link de definição", async () => {
    const r = await cadastrar({ nome: "Carla", email: "carla@x.com", grupo_id: GRUPO_A }, MASTER_A);
    expect(r.senha).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/senha|password/i);
    expect(r.link).toStartWith("https://");
    expect(log).toContain("generateLink:recovery:carla@x.com");
    expect(log).not.toContain("updateUserById");
  });
  test("M2: master da Imob A (acesso total) não cadastra em grupo da Imob B", async () => {
    await expect(cadastrar({ nome: "Infiltrado", email: "inf@x.com", grupo_id: GRUPO_B }, MASTER_A)).rejects.toThrow("grupos da sua empresa");
    expect(log.some((l) => l.startsWith("createUser"))).toBe(false);
  });
});

describe("C3: redefinirSenhaCorretor", () => {
  test("corretor normal da própria empresa: devolve link, não senha", async () => {
    const r = await redefinir({ corretor_id: "c0000000-0000-0000-0000-0000000000a1" }, MASTER_A);
    expect(r.senha).toBeUndefined();
    expect(r.link).toStartWith("https://");
    expect(log).not.toContain("updateUserById");
  });
  test("ficha de corretor apontando para o super admin: recusa", async () => {
    await expect(redefinir({ corretor_id: "c0000000-0000-0000-0000-0000000000ff" }, MASTER_A)).rejects.toThrow("não pode ter a senha redefinida");
    expect(log.some((l) => l.startsWith("generateLink"))).toBe(false);
  });
  test("master com acesso total não mexe em corretor de outra empresa", async () => {
    await expect(redefinir({ corretor_id: "c0000000-0000-0000-0000-0000000000b1" }, MASTER_A)).rejects.toThrow("outra empresa");
  });
});
