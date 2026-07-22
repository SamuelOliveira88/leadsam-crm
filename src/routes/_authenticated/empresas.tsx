import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Loader2 } from "lucide-react";
import { listarEmpresas, cadastrarEmpresa, atualizarEmpresa } from "@/lib/empresas.functions";
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

export const Route = createFileRoute("/_authenticated/empresas")({
  ssr: false,
  component: Empresas,
});

function Empresas() {
  const qc = useQueryClient();
  const fetchPerfil = useServerFn(meuPerfil);
  const fetchEmpresas = useServerFn(listarEmpresas);
  const criarFn = useServerFn(criarEmpresa);
  const atualizarFn = useServerFn(atualizarEmpresa);

  const { data: perfil, isLoading: carregandoPerfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const { data: empresas, isLoading } = useQuery({
    queryKey: ["empresas"],
    queryFn: () => fetchEmpresas(),
    enabled: !!perfil?.super_admin,
  });

  const [novaOpen, setNovaOpen] = useState(false);

  if (!carregandoPerfil && !perfil?.super_admin) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Esta tela é exclusiva do super-administrador do sistema.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas clientes</h1>
          <p className="text-sm text-muted-foreground">Painel do super-admin — visão de todas as imobiliárias</p>
        </div>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus className="mr-2 size-4" /> Nova empresa
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <div className="space-y-2">
        {(empresas ?? []).map((e: any) => (
          <Card key={e.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{e.nome}</span>
                  <Badge variant={e.ativo ? "default" : "secondary"}>{e.ativo ? "ativa" : "inativa"}</Badge>
                  <Badge variant="outline">{e.plano}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {e.corretores_em_uso} corretor(es){e.limite_corretores ? ` / limite ${e.limite_corretores}` : ""} ·{" "}
                  {e.leads_em_uso} lead(s){e.limite_leads_mes ? ` / limite ${e.limite_leads_mes}/mês` : ""} · slug: {e.slug}
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={e.plano} onValueChange={(v) => atualizarFn({ data: { id: e.id, plano: v as any } }).then(() => qc.invalidateQueries({ queryKey: ["empresas"] }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await atualizarFn({ data: { id: e.id, ativo: !e.ativo } });
                    qc.invalidateQueries({ queryKey: ["empresas"] });
                  } catch (err: any) { toast.error(err.message ?? "Erro"); }
                }}>
                  {e.ativo ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova empresa cliente</DialogTitle></DialogHeader>
          <NovaEmpresaForm
            onSubmit={async (dados) => {
              try {
                await criarFn({ data: dados });
                toast.success("Empresa criada.");
                setNovaOpen(false);
                qc.invalidateQueries({ queryKey: ["empresas"] });
              } catch (e: any) {
                toast.error(e.message ?? "Erro ao criar empresa");
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaEmpresaForm({ onSubmit }: { onSubmit: (d: any) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [plano, setPlano] = useState("starter");
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="space-y-3">
      <div><Label>Nome da imobiliária</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      <div><Label>Slug (identificador único, ex: minha-imobiliaria)</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
      <div>
        <Label>Plano</Label>
        <Select value={plano} onValueChange={setPlano}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button disabled={!nome || !slug || enviando} onClick={async () => {
          setEnviando(true);
          await onSubmit({ nome, slug, plano });
          setEnviando(false);
        }}>
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
          Criar
        </Button>
      </DialogFooter>
    </div>
  );
}
