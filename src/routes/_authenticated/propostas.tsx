import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, FileText, Check, X, Send, Loader2 } from "lucide-react";
import {
  listarPropostas, criarProposta, enviarProposta, decidirProposta, excluirProposta,
} from "@/lib/propostas.functions";
import { listarLeads } from "@/lib/leads.functions";
import { listarEmpreendimentos, listarUnidades } from "@/lib/espelho.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/propostas")({
  ssr: false,
  component: Propostas,
});

const LABEL_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const COR_STATUS: Record<string, string> = {
  rascunho: "text-muted-foreground",
  enviada: "border-blue-500/50 text-blue-700",
  em_analise: "border-amber-500/50 text-amber-700",
  aprovada: "border-emerald-500/50 text-emerald-700",
  recusada: "border-rose-500/50 text-rose-700",
  cancelada: "text-muted-foreground line-through",
};

function moeda(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Propostas() {
  const qc = useQueryClient();
  const fetchPerfil = useServerFn(meuPerfil);
  const fetchPropostas = useServerFn(listarPropostas);
  const fetchLeads = useServerFn(listarLeads);
  const criarFn = useServerFn(criarProposta);
  const enviarFn = useServerFn(enviarProposta);
  const decidirFn = useServerFn(decidirProposta);
  const excluirFn = useServerFn(excluirProposta);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const podeGerenciar = perfil?.role === "master" || perfil?.role === "gerente";

  const { data: propostas, isLoading } = useQuery({ queryKey: ["propostas"], queryFn: () => fetchPropostas() });
  const { data: leads } = useQuery({ queryKey: ["leads"], queryFn: () => fetchLeads() });

  const [novaOpen, setNovaOpen] = useState(false);
  const [filtro, setFiltro] = useState<string>("todas");

  const invalidar = () => qc.invalidateQueries({ queryKey: ["propostas"] });

  const lista = useMemo(() => {
    if (filtro === "todas") return propostas ?? [];
    return (propostas ?? []).filter((p: any) => p.status === filtro);
  }, [propostas, filtro]);

  const resumo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of propostas ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [propostas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propostas</h1>
          <p className="text-sm text-muted-foreground">Fluxo de negociação: rascunho → enviada → aprovada/recusada</p>
        </div>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus className="mr-2 size-4" /> Nova proposta
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filtro === "todas" ? "default" : "outline"} onClick={() => setFiltro("todas")}>
          Todas ({propostas?.length ?? 0})
        </Button>
        {Object.keys(LABEL_STATUS).map((s) => (
          <Button key={s} size="sm" variant={filtro === s ? "default" : "outline"} onClick={() => setFiltro(s)}>
            {LABEL_STATUS[s]} ({resumo[s] ?? 0})
          </Button>
        ))}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando propostas…</div>}

      <div className="space-y-2">
        {lista.map((p: any) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-semibold">{p.leads?.nome ?? "Lead removido"}</span>
                  <Badge variant="outline" className={COR_STATUS[p.status]}>{LABEL_STATUS[p.status]}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {moeda(p.valor_proposto)}
                  {p.valor_entrada ? ` · entrada ${moeda(p.valor_entrada)}` : ""}
                  {p.parcelas ? ` · ${p.parcelas}x` : ""}
                  {p.unidades ? ` · Unidade ${p.unidades.numero} (${p.unidades.torre})` : ""}
                  {p.corretores?.nome ? ` · ${p.corretores.nome}` : ""}
                </div>
                {p.condicoes && <div className="mt-1 text-xs text-muted-foreground">{p.condicoes}</div>}
                {p.motivo_recusa && <div className="mt-1 text-xs text-rose-600">Motivo: {p.motivo_recusa}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {p.status === "rascunho" && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    try { await enviarFn({ data: { id: p.id } }); toast.success("Proposta enviada."); invalidar(); }
                    catch (e: any) { toast.error(e.message ?? "Erro"); }
                  }}>
                    <Send className="mr-1.5 size-3.5" /> Enviar
                  </Button>
                )}
                {podeGerenciar && (p.status === "enviada" || p.status === "em_analise") && (
                  <>
                    <Button size="sm" onClick={async () => {
                      try { await decidirFn({ data: { id: p.id, status: "aprovada" } }); toast.success("Proposta aprovada."); invalidar(); }
                      catch (e: any) { toast.error(e.message ?? "Erro"); }
                    }}>
                      <Check className="mr-1.5 size-3.5" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      const motivo = window.prompt("Motivo da recusa (opcional):") ?? undefined;
                      try { await decidirFn({ data: { id: p.id, status: "recusada", motivo_recusa: motivo || null } }); toast.success("Proposta recusada."); invalidar(); }
                      catch (e: any) { toast.error(e.message ?? "Erro"); }
                    }}>
                      <X className="mr-1.5 size-3.5" /> Recusar
                    </Button>
                  </>
                )}
                {podeGerenciar && (
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!window.confirm("Excluir esta proposta?")) return;
                    try { await excluirFn({ data: { id: p.id } }); invalidar(); }
                    catch (e: any) { toast.error(e.message ?? "Erro"); }
                  }}>
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && lista.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma proposta encontrada.</Card>
        )}
      </div>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova proposta</DialogTitle></DialogHeader>
          <NovaPropostaForm
            leads={leads ?? []}
            onSubmit={async (dados) => {
              try {
                await criarFn({ data: dados });
                toast.success("Proposta criada como rascunho.");
                setNovaOpen(false);
                invalidar();
              } catch (e: any) {
                toast.error(e.message ?? "Erro ao criar proposta");
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaPropostaForm({ leads, onSubmit }: { leads: any[]; onSubmit: (d: any) => Promise<void> }) {
  const fetchEmpreendimentos = useServerFn(listarEmpreendimentos);
  const fetchUnidades = useServerFn(listarUnidades);

  const [leadId, setLeadId] = useState("");
  const [empId, setEmpId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [valor, setValor] = useState<number | "">("");
  const [entrada, setEntrada] = useState<number | "">("");
  const [parcelas, setParcelas] = useState<number | "">("");
  const [condicoes, setCondicoes] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: empreendimentos } = useQuery({ queryKey: ["empreendimentos"], queryFn: () => fetchEmpreendimentos() });
  const { data: unidades } = useQuery({
    queryKey: ["unidades", empId],
    queryFn: () => fetchUnidades({ data: { empreendimento_id: empId } }),
    enabled: !!empId,
  });
  const disponiveis = (unidades ?? []).filter((u: any) => u.status === "disponivel");

  return (
    <div className="space-y-3">
      <div>
        <Label>Lead</Label>
        <Select value={leadId} onValueChange={setLeadId}>
          <SelectTrigger><SelectValue placeholder="Selecione o lead" /></SelectTrigger>
          <SelectContent>
            {leads.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>{l.nome} · {l.telefone ?? "sem telefone"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Empreendimento (opcional, pra vincular uma unidade)</Label>
        <Select value={empId} onValueChange={(v) => { setEmpId(v); setUnidadeId(""); }}>
          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
          <SelectContent>
            {(empreendimentos ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {empId && (
        <div>
          <Label>Unidade disponível</Label>
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
            <SelectContent>
              {disponiveis.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>{u.torre} · {u.numero} {u.valor ? `· ${moeda(u.valor)}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div><Label>Valor proposto (R$)</Label><Input type="number" value={valor} onChange={(e) => setValor(e.target.value ? Number(e.target.value) : "")} /></div>
        <div><Label>Entrada (R$)</Label><Input type="number" value={entrada} onChange={(e) => setEntrada(e.target.value ? Number(e.target.value) : "")} /></div>
        <div><Label>Parcelas</Label><Input type="number" value={parcelas} onChange={(e) => setParcelas(e.target.value ? Number(e.target.value) : "")} /></div>
      </div>

      <div>
        <Label>Condições / observações</Label>
        <Textarea value={condicoes} onChange={(e) => setCondicoes(e.target.value)} rows={3} />
      </div>

      <DialogFooter>
        <Button
          disabled={!leadId || !valor || enviando}
          onClick={async () => {
            setEnviando(true);
            await onSubmit({
              lead_id: leadId,
              unidade_id: unidadeId || null,
              valor_proposto: Number(valor),
              valor_entrada: entrada || null,
              parcelas: parcelas || null,
              condicoes: condicoes || null,
            });
            setEnviando(false);
          }}
        >
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
          Criar proposta
        </Button>
      </DialogFooter>
    </div>
  );
}
