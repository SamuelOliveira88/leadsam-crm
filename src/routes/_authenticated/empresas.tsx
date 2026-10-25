import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Loader2 } from "lucide-react";
import { listarEmpresas, cadastrarEmpresa, atualizarEmpresa, acaoTesteEmpresa } from "@/lib/empresas.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { tr, mark } from "@/i18n";
export const Route = createFileRoute("/_authenticated/empresas")({
  ssr: false,
  component: Empresas,
});

const STATUS_LABEL: Record<string, string> = { teste: mark("Teste"), ativa: mark("Ativa"), em_atraso: mark("Em atraso"), suspensa: mark("Suspensa") };

function textoStatus(e: any) {
  if (e.status === "teste" && e.teste_ate) {
    const dias = Math.ceil((new Date(e.teste_ate).getTime() - Date.now()) / 86400000);
    return dias > 0 ? tr(dias === 1 ? mark("Teste: {dias} dia restante") : mark("Teste: {dias} dias restantes"), { dias }) : tr("Teste encerrado");
  }
  return tr(STATUS_LABEL[e.status] ?? e.status);
}

function Empresas() {
  const qc = useQueryClient();
  const fetchPerfil = useServerFn(meuPerfil);
  const fetchEmpresas = useServerFn(listarEmpresas);
  const criarFn = useServerFn(cadastrarEmpresa);
  const atualizarFn = useServerFn(atualizarEmpresa);
  const testeFn = useServerFn(acaoTesteEmpresa);

  const { data: perfil, isLoading: carregandoPerfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const { data: empresas, isLoading } = useQuery({
    queryKey: ["empresas"],
    queryFn: () => fetchEmpresas(),
    enabled: !!perfil?.super_admin,
  });

  const [novaOpen, setNovaOpen] = useState(false);
  const [codigoGerado, setCodigoGerado] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function gerarCodigo() {
    setGerando(true);
    try {
      const { data, error } = await (supabase as any).rpc("gerar_convite_imobiliaria", { p_validade_dias: 7 });
      if (error) throw new Error(error.message);
      setCodigoGerado(String(data));
    } catch (err: any) { toast.error(tr(err.message) ?? tr("Não foi possível gerar o código.")); }
    finally { setGerando(false); }
  }

  async function acao(id: string, a: "iniciar" | "prorrogar" | "ativar") {
    try {
      await testeFn({ data: { id, acao: a } });
      toast.success(a === "ativar" ? tr("Plano ativado.") : a === "iniciar" ? tr("Teste de 7 dias iniciado.") : tr("Teste prorrogado em 7 dias."));
      qc.invalidateQueries({ queryKey: ["empresas"] });
    } catch (err: any) { toast.error(tr(err.message) ?? tr("Erro")); }
  }

  if (!carregandoPerfil && !perfil?.super_admin) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">{tr("Esta tela é exclusiva do super-administrador do sistema.")}</Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tr("Empresas clientes")}</h1>
          <p className="text-sm text-muted-foreground">{tr("Painel do super-admin — visão de todas as imobiliárias")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={gerarCodigo} disabled={gerando}>
            {gerando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{tr("Gerar código de convite")}</Button>
          <Button size="sm" onClick={() => setNovaOpen(true)}>
            <Plus className="mr-2 size-4" /> {tr("Nova empresa")}</Button>
        </div>
      </div>

      {codigoGerado && (
        <Card className="space-y-2 p-4">
          <div className="text-sm text-muted-foreground">{tr("Código de convite (vale 7 dias, 1 uso):")}</div>
          <div className="text-2xl font-bold tracking-widest">{codigoGerado}</div>
          <div className="break-all text-xs text-muted-foreground">
            {tr("{origin}/cadastro-empresa?codigo={codigoGerado}", { origin: window.location.origin, codigoGerado })}
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/cadastro-empresa?codigo=${codigoGerado}`);
            toast.success(tr("Link copiado."));
          }}>{tr("Copiar link")}</Button>
        </Card>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">{tr("Carregando…")}</div>}

      <div className="space-y-2">
        {(empresas ?? []).map((e: any) => (
          <Card key={e.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{e.nome}</span>
                  <Badge variant={e.ativo ? "default" : "secondary"}>{e.ativo ? tr("ativa") : tr("inativa")}</Badge>
                  <Badge variant={e.status === "suspensa" || e.status === "em_atraso" ? "destructive" : e.status === "teste" ? "secondary" : "outline"}>{textoStatus(e)}</Badge>
                  <Badge variant="outline">{e.plano}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{tr("{corretores_em_uso} corretor(es)", { corretores_em_uso: e.corretores_em_uso })}{e.limite_corretores ? tr(" / limite {limite_corretores}", { limite_corretores: e.limite_corretores }) : ""} {tr("· {leads_em_uso} lead(s)", { leads_em_uso: e.leads_em_uso })}{e.limite_leads_mes ? tr(" / limite {limite_leads_mes}/mês", { limite_leads_mes: e.limite_leads_mes }) : ""} {tr("· slug: {slug}", { slug: e.slug })}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={e.status ?? "ativa"} onValueChange={(v) => atualizarFn({ data: { id: e.id, status: v as any } }).then(() => qc.invalidateQueries({ queryKey: ["empresas"] })).catch((err: any) => toast.error(tr(err.message) ?? tr("Erro")))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teste">{tr("Teste")}</SelectItem>
                    <SelectItem value="ativa">{tr("Ativa")}</SelectItem>
                    <SelectItem value="em_atraso">{tr("Em atraso")}</SelectItem>
                    <SelectItem value="suspensa">{tr("Suspensa")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => acao(e.id, "iniciar")}>{tr("Iniciar teste de 7 dias")}</Button>
                <Button size="sm" variant="outline" onClick={() => acao(e.id, "prorrogar")}>{tr("Prorrogar +7 dias")}</Button>
                <Button size="sm" onClick={() => acao(e.id, "ativar")}>{tr("Ativar plano")}</Button>
                <Select value={e.plano} onValueChange={(v) => atualizarFn({ data: { id: e.id, plano: v as any } }).then(() => qc.invalidateQueries({ queryKey: ["empresas"] }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">{tr("Starter")}</SelectItem>
                    <SelectItem value="pro">{tr("Pro")}</SelectItem>
                    <SelectItem value="enterprise">{tr("Enterprise")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await atualizarFn({ data: { id: e.id, ativo: !e.ativo } });
                    qc.invalidateQueries({ queryKey: ["empresas"] });
                  } catch (err: any) { toast.error(tr(err.message) ?? tr("Erro")); }
                }}>
                  {e.ativo ? tr("Desativar") : tr("Reativar")}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Nova imobiliária cliente")}</DialogTitle></DialogHeader>
          <NovaEmpresaForm
            onSubmit={async (dados) => {
              try {
                await criarFn({ data: dados });
                toast.success(tr("Empresa criada! Convite enviado por e-mail para o administrador."));
                setNovaOpen(false);
                qc.invalidateQueries({ queryKey: ["empresas"] });
              } catch (e: any) {
                toast.error(tr(e.message) ?? tr("Erro ao criar empresa"));
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaEmpresaForm({ onSubmit }: { onSubmit: (d: { nome_empresa: string; nome_usuario: string; email: string; iniciar_teste: boolean }) => Promise<void> }) {
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [teste, setTeste] = useState(true);
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="space-y-3">
      <div><Label>{tr("Nome da imobiliária")}</Label><Input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder={tr("Ex: Imobiliária Alpha")} /></div>
      <div><Label>{tr("Nome do administrador (master)")}</Label><Input value={nomeUsuario} onChange={(e) => setNomeUsuario(e.target.value)} placeholder={tr("Nome completo")} /></div>
      <div>
        <Label>{tr("E-mail do administrador")}</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("admin@imobiliaria.com")} />
        <p className="mt-1 text-xs text-muted-foreground">{tr("Um convite será enviado por e-mail. O usuário define a própria senha ao entrar pela primeira vez.")}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={teste} onChange={(e) => setTeste(e.target.checked)} />{tr("Iniciar com teste de 7 dias")}</label>
      <DialogFooter>
        <Button disabled={!nomeEmpresa || !nomeUsuario || !email || enviando} onClick={async () => {
          setEnviando(true);
          try {
            await onSubmit({ nome_empresa: nomeEmpresa, nome_usuario: nomeUsuario, email, iniciar_teste: teste });
          } finally { setEnviando(false); }
        }}>
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}{tr("Criar e enviar convite")}</Button>
      </DialogFooter>
    </div>
  );
}

