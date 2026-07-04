import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { listarConsultores, criarConsultor, criarConsultorComConta, atualizarConsultor, excluirConsultor } from "@/lib/consultores.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const ADMIN_EMAIL = "samuelrodrigodeoliveira@gmail.com";

export const Route = createFileRoute("/_authenticated/consultores")({
  head: () => ({ meta: [{ title: "Equipe — ImobLead" }] }),
  component: ConsultoresPage,
});

type Consultor = { id: string; nome: string; numero_whatsapp: string; ativo: boolean; ordem_rodizio: number };

function ConsultoresPage() {
  const { user } = Route.useRouteContext();
  const isAdmin = (user.email ?? "").toLowerCase() === ADMIN_EMAIL;
  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-10 text-destructive" />
        <h2 className="text-lg font-semibold">Acesso negado</h2>
        <p className="mt-1 text-sm text-muted-foreground">Apenas o administrador pode gerenciar consultores.</p>
      </Card>
    );
  }
  return <AdminView />;
}

function AdminView() {
  const listar = useServerFn(listarConsultores);
  const criar = useServerFn(criarConsultor);
  const criarComConta = useServerFn(criarConsultorComConta);
  const atualizar = useServerFn(atualizarConsultor);
  const excluir = useServerFn(excluirConsultor);
  const qc = useQueryClient();

  const consultores = useQuery({ queryKey: ["consultores"], queryFn: () => listar() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Consultor | null>(null);
  const [f, setF] = useState({ nome: "", numero_whatsapp: "", ativo: true, ordem_rodizio: 0, email: "", senha: "", criarLogin: true });

  const openForm = (c?: Consultor) => {
    if (c) { setEditing(c); setF({ nome: c.nome, numero_whatsapp: c.numero_whatsapp, ativo: c.ativo, ordem_rodizio: c.ordem_rodizio, email: "", senha: "", criarLogin: false }); }
    else { setEditing(null); setF({ nome: "", numero_whatsapp: "", ativo: true, ordem_rodizio: (consultores.data?.length ?? 0), email: "", senha: "", criarLogin: true }); }
    setOpen(true);
  };

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (editing) return atualizar({ data: { id: editing.id, patch: { nome: f.nome, numero_whatsapp: f.numero_whatsapp, ativo: f.ativo, ordem_rodizio: f.ordem_rodizio } } });
      if (f.criarLogin) return criarComConta({ data: { nome: f.nome, numero_whatsapp: f.numero_whatsapp, ativo: f.ativo, ordem_rodizio: f.ordem_rodizio, email: f.email, senha: f.senha } });
      return criar({ data: { nome: f.nome, numero_whatsapp: f.numero_whatsapp, ativo: f.ativo, ordem_rodizio: f.ordem_rodizio } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["consultores"] }); qc.invalidateQueries({ queryKey: ["consultores-public"] }); toast.success("Salvo"); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => atualizar({ data: { id: v.id, patch: { ativo: v.ativo } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consultores"] }),
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["consultores"] }); toast.success("Removido"); },
  });

  const list = (consultores.data ?? []) as Consultor[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Equipe</h1>
          <p className="text-sm text-muted-foreground">{list.length} / 10 consultores cadastrados</p>
        </div>
        <Button onClick={() => openForm()} disabled={list.length >= 10}><Plus className="mr-2 size-4" /> Novo consultor</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y">
          {list.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {c.ordem_rodizio + 1}
                </div>
                <div>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.numero_whatsapp}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className={c.ativo ? "text-success" : "text-muted-foreground"}>{c.ativo ? "Ativo" : "Inativo"}</span>
                  <Switch checked={c.ativo} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, ativo: v })} />
                </div>
                <Button size="icon" variant="outline" onClick={() => openForm(c)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="outline" onClick={() => confirm(`Excluir ${c.nome}?`) && excluirMut.mutate(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
          {list.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum consultor. Cadastre o primeiro.</div>}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar consultor" : "Novo consultor"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvarMut.mutate(); }}>
            <div><Label>Nome</Label><Input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div><Label>WhatsApp (com DDD e país)</Label><Input required value={f.numero_whatsapp} onChange={(e) => setF({ ...f, numero_whatsapp: e.target.value })} placeholder="5511999998888" /></div>
            {!editing && (
              <div className="flex items-center gap-2 rounded-md border p-3">
                <Switch checked={f.criarLogin} onCheckedChange={(v) => setF({ ...f, criarLogin: v })} />
                <span className="text-sm">Criar login para o consultor acessar o app</span>
              </div>
            )}
            {!editing && f.criarLogin && (
              <>
                <div><Label>E-mail de acesso</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="consultor@exemplo.com" /></div>
                <div><Label>Senha provisória (mín. 6)</Label><Input type="text" required minLength={6} value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} placeholder="Compartilhe com o consultor" /></div>
              </>
            )}
            <div><Label>Ordem no rodízio</Label><Input type="number" min="0" value={f.ordem_rodizio} onChange={(e) => setF({ ...f, ordem_rodizio: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} /><span className="text-sm">Ativo no rodízio</span></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvarMut.isPending}>{salvarMut.isPending ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
