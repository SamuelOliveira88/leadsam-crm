import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Phone, Home, Users2, Trash2 } from "lucide-react";
import { listarCompromissos, criarCompromisso, excluirCompromisso } from "@/lib/compromissos.functions";
import { listarLeads } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — ImobLead" }] }),
  component: AgendaPage,
});

const TIPO_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  visita: { label: "Visita", icon: Home, color: "bg-primary-soft text-primary" },
  ligacao: { label: "Ligação", icon: Phone, color: "bg-accent/20 text-accent-foreground" },
  reuniao: { label: "Reunião", icon: Users2, color: "bg-success/15 text-success" },
};

type Compromisso = { id: string; tipo: keyof typeof TIPO_META; titulo: string; data_hora: string; notas: string | null; lead_id: string | null; leads: { nome: string } | null };

function AgendaPage() {
  const listar = useServerFn(listarCompromissos);
  const criar = useServerFn(criarCompromisso);
  const excluir = useServerFn(excluirCompromisso);
  const listLeads = useServerFn(listarLeads);
  const qc = useQueryClient();

  const items = useQuery({ queryKey: ["compromissos"], queryFn: () => listar() });
  const leads = useQuery({ queryKey: ["leads"], queryFn: () => listLeads() });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: "visita" as keyof typeof TIPO_META, titulo: "", data_hora: "", notas: "", lead_id: "" });

  const criarMut = useMutation({
    mutationFn: (d: typeof f) => criar({ data: { ...d, data_hora: new Date(d.data_hora).toISOString(), notas: d.notas || null, lead_id: d.lead_id || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compromissos"] }); toast.success("Compromisso criado"); setOpen(false); setF({ tipo: "visita", titulo: "", data_hora: "", notas: "", lead_id: "" }); },
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compromissos"] }); toast.success("Removido"); },
  });

  const all = (items.data ?? []) as Compromisso[];
  const hoje = all.filter((c) => isToday(new Date(c.data_hora)));
  const amanha = all.filter((c) => isTomorrow(new Date(c.data_hora)));
  const semana = all.filter((c) => {
    const d = new Date(c.data_hora); return isThisWeek(d, { locale: ptBR }) && !isToday(d) && !isTomorrow(d);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Agenda</h1>
          <p className="text-sm text-muted-foreground">Visitas, ligações e reuniões em um só lugar.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4" /> Novo compromisso</Button>
      </div>

      <Grupo titulo="Hoje" items={hoje} onDelete={(id) => excluirMut.mutate(id)} />
      <Grupo titulo="Amanhã" items={amanha} onDelete={(id) => excluirMut.mutate(id)} />
      <Grupo titulo="Esta semana" items={semana} onDelete={(id) => excluirMut.mutate(id)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo compromisso</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); criarMut.mutate(f); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v as keyof typeof TIPO_META })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_META).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data e hora</Label>
                <Input type="datetime-local" required value={f.data_hora} onChange={(e) => setF({ ...f, data_hora: e.target.value })} />
              </div>
            </div>
            <div><Label>Título</Label><Input required value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
            <div>
              <Label>Lead relacionado (opcional)</Label>
              <Select value={f.lead_id || "none"} onValueChange={(v) => setF({ ...f, lead_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nenhum —</SelectItem>
                  {(leads.data ?? []).map((l) => (<SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={criarMut.isPending}>{criarMut.isPending ? "Salvando…" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grupo({ titulo, items, onDelete }: { titulo: string; items: Compromisso[]; onDelete: (id: string) => void }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
      <div className="space-y-2">
        {items.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhum compromisso.</Card>}
        {items.map((c) => {
          const meta = TIPO_META[c.tipo];
          const Icon = meta.icon;
          return (
            <Card key={c.id} className="flex items-center gap-3 p-4">
              <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${meta.color}`}><Icon className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.titulo}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(c.data_hora), "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                  {c.leads?.nome && <> • {c.leads.nome}</>}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
