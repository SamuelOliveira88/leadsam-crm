import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cadastrarEmpresa } from "@/lib/empresas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/cadastro-empresa")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Cadastre sua imobiliária" }],
  }),
  component: CadastroEmpresa,
});

function CadastroEmpresa() {
  const navigate = useNavigate();
  const cadastrarFn = useServerFn(cadastrarEmpresa);
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await cadastrarFn({ data: { nome_empresa: nomeEmpresa, nome_usuario: nomeUsuario, email, senha } });
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      toast.success("Empresa criada! Bem-vindo.");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao cadastrar empresa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Building2 className="size-6" />
          <h1 className="text-xl font-bold">Cadastre sua imobiliária</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Crie sua conta e comece a usar o CRM com seu próprio time, isolado de qualquer outra empresa.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><Label>Nome da imobiliária</Label><Input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required /></div>
          <div><Label>Seu nome</Label><Input value={nomeUsuario} onChange={(e) => setNomeUsuario(e.target.value)} required /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label>Senha (mín. 8 caracteres)</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando conta…" : "Criar minha conta"}
          </Button>
        </form>
        <div className="text-center text-sm">
          <Link to="/auth" className="text-muted-foreground underline">Já tenho uma conta</Link>
        </div>
      </Card>
    </div>
  );
}
