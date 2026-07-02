import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, MessageCircle, Loader2, Search } from "lucide-react";
import { listarLeads, criarLead, atualizarLead, excluirLead } from "@/lib/leads.functions";
import { listarConsultoresPublicos } from "@/lib/consultores.functions";
import { gerarMensagemWhatsApp } from "@/lib/ai.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ESTAGIOS_ORDEM, ESTAGIO_COLORS, ESTAGIO_LABELS, formatBRL, formatPhoneDisplay, sanitizePhone, type Estagio } from "@/lib/formatters";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — ImobLead" }] }),
  component: LeadsPage,
});

type LeadRow = {
  id: string; nome: string; telefone: string; origem: string;
  estagio: Estagio; interesse: string | null; valor_estimado: number | null;
  consultor_id: string | null; created_at: string;
};

function LeadsPage() {
  const listar = useServerFn(listarLeads);
  const criar = useServerFn(criarLead);
  const atualizar = useServerFn(atualizarLead);
  const excluir = useServerFn(excluirLead);
  const listConsultores = useServerFn(listarConsultoresPublicos);
  const gerarMsg = useServerFn(gerarMensagemWhatsApp);
  const qc = useQueryClient();

  const leads = useQuery({ queryKey: ["leads"], queryFn: () => listar() });
  const consultores = useQuery({ queryKey: ["consultores-public"], queryFn: () => listConsultores() });

  const [filtro, setFiltro] = useState<Estagio | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<LeadRow | null>(null);

  const criarMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => criar({ data: d as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead criado"); setOpenForm(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const atualizarMut = useMutation({
    mutationFn: (d: { id: string; patch: Record<string, unknown> }) => atualizar({ data: d as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead atualizado"); setOpenForm(false); setEditing(null); },
  });
  const excluirMut = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead excluído"); },
  });

  const gerarMsgMut = useMutation({
    mutationFn: (leadId: string) => gerarMsg({ data: { leadId } }),
    onSuccess: (r) => {
      const wa = `https://wa.me/${sanitizePhone(r.telefone)}?text=${encodeURIComponent(r.mensagem)}`;
      window.open(wa, "_blank");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar mensagem"),
  });

  const filtered = ((leads.data ?? []) as LeadRow[])
    .filter((l) => filtro === "todos" || l.estagio === filtro)
    .filter((l) => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone.includes(busca));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.data?.length ?? 0} leads no total</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}><Plus className="mr-2 size-4" /> Novo lead</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltro("todos")} className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === "todos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Todos</button>
          {ESTAGIOS_ORDEM.map((e) => (
            <button key={e} onClick={() => setFiltro(e)} className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {ESTAGIO_LABELS[e]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((l) => (
          <Card key={l.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{l.nome}</div>
                <div className="text-xs text-muted-foreground">{formatPhoneDisplay(l.telefone)}</div>
              </div>
              <Badge className={ESTAGIO_COLORS[l.estagio]}>{ESTAGIO_LABELS[l.estagio]}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5">{l.origem}</span>
              {l.valor_estimado ? <span>• {formatBRL(l.valor_estimado)}</span> : null}
            </div>
            {l.interesse && <p className="line-clamp-2 text-xs text-muted-foreground">{l.interesse}</p>}
            <div className="mt-auto flex gap-2 pt-2">
              <Button size="sm" className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                onClick={() => gerarMsgMut.mutate(l.id)} disabled={gerarMsgMut.isPending}>
                {gerarMsgMut.isPending && gerarMsgMut.variables === l.id ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                <span className="ml-1 hidden sm:inline">Msg + WhatsApp</span>
                <span className="ml-1 sm:hidden">WhatsApp</span>
              </Button>
              <Button size="icon" variant="outline" onClick={() => { setEditing(l); setOpenForm(true); }}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => confirm("Excluir este lead?") && excluirMut.mutate(l.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && !leads.isLoading && (
          <Card className="col-span-full p-8 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</Card>
        )}
      </div>

      <LeadFormDialog
        open={openForm}
        onOpenChange={(v) => { setOpenForm(v); if (!v) setEditing(null); }}
        initial={editing}
        consultores={consultores.data ?? []}
        onSubmit={(vals) => {
          if (editing) atualizarMut.mutate({ id: editing.id, patch: vals });
          else criarMut.mutate(vals);
        }}
        submitting={criarMut.isPending || atualizarMut.isPending}
      />
    </div>
  );
}

function LeadFormDialog({ open, onOpenChange, initial, consultores, onSubmit, submitting }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: LeadRow | null;
  consultores: Array<{ id: string; nome: string }>; onSubmit: (v: Record<string, unknown>) => void; submitting: boolean;
}) {
  const [f, setF] = useState({
    nome: initial?.nome ?? "", telefone: initial?.telefone ?? "", origem: initial?.origem ?? "Manual",
    estagio: initial?.estagio ?? "novo", interesse: initial?.interesse ?? "",
    valor_estimado: initial?.valor_estimado?.toString() ?? "", consultor_id: initial?.consultor_id ?? "",
  });
  // reset when initial changes
  const key = initial?.id ?? "new";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" key={key}>
        <DialogHeader><DialogTitle>{initial ? "Editar lead" : "Novo lead"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            nome: f.nome, telefone: sanitizePhone(f.telefone), origem: f.origem, estagio: f.estagio,
            interesse: f.interesse || null,
            valor_estimado: f.valor_estimado ? Number(f.valor_estimado) : null,
            consultor_id: f.consultor_id || null,
          });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Nome</Label><Input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input required value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(11) 99999-9999" /></div>
            <div><Label>Origem</Label><Input value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} /></div>
            <div>
              <Label>Estágio</Label>
              <Select value={f.estagio} onValueChange={(v) => setF({ ...f, estagio: v as Estagio })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTAGIOS_ORDEM.map((e) => (<SelectItem key={e} value={e}>{ESTAGIO_LABELS[e]}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor estimado (R$)</Label>
              <Input type="number" min="0" value={f.valor_estimado} onChange={(e) => setF({ ...f, valor_estimado: e.target.value })} />
            </div>
            <div>
              <Label>Consultor</Label>
              <Select value={f.consultor_id || "none"} onValueChange={(v) => setF({ ...f, consultor_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nenhum —</SelectItem>
                  {consultores.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Interesse / observações</Label>
            <Textarea rows={3} value={f.interesse} onChange={(e) => setF({ ...f, interesse: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
