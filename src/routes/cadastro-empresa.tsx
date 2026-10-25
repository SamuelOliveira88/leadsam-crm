import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/cadastro-empresa")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ codigo: typeof s.codigo === "string" ? s.codigo : "" }),
  head: () => ({
    meta: [
      { title: "Cadastro por convite — Alexandria Leds" },
      { name: "description", content: "Novas imobiliárias entram com um código de convite." },
    ],
  }),
  component: CadastroPorCodigo,
});

function CadastroPorCodigo() {
  const { codigo: codigoUrl } = Route.useSearch();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState(codigoUrl.toUpperCase());
  const [empresa, setEmpresa] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  // Já entrou (ex.: pelo Google): só falta o código e o nome da imobiliária.
  const [logado, setLogado] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setLogado(true);
      setEmail(u.email ?? "");
      const n = (u.user_metadata?.full_name ?? u.user_metadata?.nome ?? "") as string;
      if (n) setNome((x) => x || n);
    });
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      if (!logado) {
      // 1) cria a conta (ou entra, se ela já existe e ainda não pertence a nenhuma imobiliária)
      const { data: cad, error: eCad } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: nome.trim() } },
      });
      let temSessao = !!cad.session;
      if (eCad && !/already|registered/i.test(eCad.message)) throw new Error(eCad.message);
      if (!temSessao) {
        const { data: ent, error: eEnt } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (eEnt) {
          toast.message("Confirme seu e-mail", {
            description: "Abra o e-mail que enviamos, confirme, e volte aqui para clicar em Criar de novo (os dados ficam salvos).",
            duration: 15000,
          });
          return;
        }
        temSessao = !!ent.session;
      }
      }
      // 2) usa o código: o banco cria a imobiliária (teste de 7 dias) e deixa você como master
      const { error: eRpc } = await (supabase as any).rpc("aceitar_convite_imobiliaria", {
        p_codigo: codigo.trim(),
        p_nome_empresa: empresa.trim(),
        p_nome: nome.trim(),
      });
      if (eRpc) throw new Error(eRpc.message);
      toast.success("Imobiliária criada! Teste de 7 dias liberado.");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível concluir o cadastro.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Cadastro por convite</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use o código que você recebeu para criar a sua imobiliária no Alexandria Leds.
          </p>
        </div>
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="cod">Código do convite</Label>
            <Input id="cod" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} maxLength={8} required className="uppercase tracking-widest" /></div>
          <div className="space-y-1"><Label htmlFor="emp">Nome da imobiliária</Label>
            <Input id="emp" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={80} required /></div>
          <div className="space-y-1"><Label htmlFor="nom">Seu nome</Label>
            <Input id="nom" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required /></div>
          {logado ? (
            <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Você entrou como <b>{email}</b>.</p>
          ) : (
            <>
              <div className="space-y-1"><Label htmlFor="em">E-mail</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
              <div className="space-y-1"><Label htmlFor="pw">Senha (mínimo 8)</Label>
                <Input id="pw" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} autoComplete="new-password" required /></div>
            </>
          )}
          <p className="text-xs text-muted-foreground">Ao criar a conta, você concorda com os <a href="/termos" target="_blank" className="underline">Termos de Uso</a> e a <a href="/privacidade" target="_blank" className="underline">Política de Privacidade</a>.</p>
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Criar minha imobiliária
          </Button>
        </form>
        <div className="text-center">
          {logado
            ? <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>Entrar com outra conta</Button>
            : <Link to="/auth"><Button variant="ghost" size="sm">Já tenho conta — entrar</Button></Link>}
        </div>
      </Card>
    </div>
  );
}
