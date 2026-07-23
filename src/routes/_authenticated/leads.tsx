import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, X, Sparkles, MessageCircle, Eye, Download, ArrowRightLeft } from "lucide-react";
import * as XLSX from "xlsx";
import { listarLeads, excluirLead, exportarLeads, transferirLead } from "@/lib/leads.functions";
import { listarCorretores } from "@/lib/corretores.functions";
import { listarNotas, criarNota, marcarLeadVisualizado, gerarMensagemAbertura } from "@/lib/notas.functions";
import { notificarCorretorDoLead } from "@/lib/evolution.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — ImobLead" }] }),
  component: Leads,
});

function Leads() {
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listarLeads);
  const del = useServerFn(excluirLead);
  const exportFn = useServerFn(exportarLeads);
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => fetchLeads() });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
  const [openLead, setOpenLead] = useState<any | null>(null);
  const [exportando, setExportando] = useState(false);

  async function handleExportar() {
    setExportando(true);
    try {
      const leads = await exportFn();
      const linhas = (leads as any[]).map((l) => ({
        Nome: l.nome,
        Telefone: l.telefone,
        Email: l.email,
        Status: l.status,
        "Etapa do funil": l.etapa_funil,
        Fonte: l.fonte,
        Canal: l.canal,
        Cidade: l.cidade,
        "Motivo de perda": l.motivo_perda,
        Observações: l.observacoes,
        "Última atividade": l.ultima_atividade,
        "Data atividade": l.data_atividade,
        "Valor negociação": l.valor_negociacao,
        "Código imóvel": l.codigo_imovel,
        Campanha: l.campanha,
        "Corretor original (planilha)": l.corretor_origem_nome,
        Corretor: l.corretores?.nome ?? "",
        Grupo: l.grupos?.nome ?? "",
        "Criado em": l.created_at,
      }));
      const ws = XLSX.utils.json_to_sheet(linhas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      const data = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `leads-imobLead-${data}.xlsx`);
      toast.success(`${linhas.length} lead(s) exportado(s).`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao exportar leads");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Toque em um lead para abrir o histórico e gerar mensagem</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleExportar} disabled={exportando}>
          <Download className="mr-2 size-4" /> {exportando ? "Exportando…" : "Exportar planilha"}
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <div className="grid gap-3">
        {(data ?? []).map((l: any) => (
          <Card
            key={l.id}
            className="flex cursor-pointer items-center justify-between p-4 transition hover:bg-accent/50"
            onClick={() => setOpenLead(l)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-semibold">{l.nome}</div>
                <Badge variant={l.status === "represado" ? "secondary" : "default"}>{l.status}</Badge>
                {l.etapa_funil && <Badge variant="outline">{l.etapa_funil}</Badge>}
                {!l.visualizado_em && l.corretor_id && (
                  <Badge variant="outline" className="border-orange-400 text-orange-600">novo</Badge>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {l.telefone ?? "—"} · {l.grupos?.nome ?? "Sem grupo"} · {l.corretores?.nome ?? "não atribuído"}
                {l.fonte ? ` · ${l.fonte}` : ""}
                {l.cidade ? ` · ${l.cidade}` : ""}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); delMut.mutate(l.id); }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </Card>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum lead ainda.</Card>
        )}
      </div>

      {openLead && <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: any; onClose: () => void }) {
  const qc = useQueryClient();
  const listNotasFn = useServerFn(listarNotas);
  const criarNotaFn = useServerFn(criarNota);
  const marcarVistoFn = useServerFn(marcarLeadVisualizado);
  const gerarFn = useServerFn(gerarMensagemAbertura);
  const notificarFn = useServerFn(notificarCorretorDoLead);
  const transferirFn = useServerFn(transferirLead);
  const listCorretoresFn = useServerFn(listarCorretores);
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [mostrarTransfer, setMostrarTransfer] = useState(false);
  const [novoCorretor, setNovoCorretor] = useState("");

  const { data: corretores } = useQuery({
    queryKey: ["corretores-transfer"],
    queryFn: () => listCorretoresFn(),
    enabled: mostrarTransfer,
  });

  const transferirMut = useMutation({
    mutationFn: () => transferirFn({ data: { lead_id: lead.id, corretor_id: novoCorretor } }),
    onSuccess: (r: any) => {
      toast.success(`Lead transferido para ${r.corretor_nome}.`);
      setMostrarTransfer(false);
      setNovoCorretor("");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao transferir"),
  });

  const { data: notas } = useQuery({
    queryKey: ["notas", lead.id],
    queryFn: () => listNotasFn({ data: { lead_id: lead.id } }),
  });

  useEffect(() => {
    if (!lead.visualizado_em) {
      marcarVistoFn({ data: { lead_id: lead.id } })
        .then(() => qc.invalidateQueries({ queryKey: ["leads"] }))
        .catch(() => {});
    }
  }, [lead.id]);

  const criarMut = useMutation({
    mutationFn: () => criarNotaFn({ data: { lead_id: lead.id, texto } }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["notas", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Nota salva. Timer de 6 dias reiniciado.");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  async function handleGerar() {
    setGerando(true);
    try {
      const { mensagem, telefone } = await gerarFn({ data: { lead_id: lead.id } });
      const phone = (telefone || lead.telefone || "").replace(/\D/g, "");
      if (!phone) { toast.error("Lead sem telefone"); return; }
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar mensagem");
    } finally { setGerando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <Card
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{lead.nome}</h2>
              <Badge variant={lead.status === "represado" ? "secondary" : "default"}>{lead.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {lead.telefone ?? "—"} · {lead.corretores?.nome ?? "não atribuído"}
              {lead.visualizado_em && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                  <Eye className="size-3" /> visto
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleGerar} disabled={gerando}>
            <Sparkles className="mr-2 size-4" />
            {gerando ? "Gerando…" : "✨ Gerar Mensagem de Abertura (IA)"}
          </Button>
          {lead.telefone && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`https://wa.me/${lead.telefone.replace(/\D/g, "")}`, "_blank")}
            >
              <MessageCircle className="mr-2 size-4" /> Abrir WhatsApp
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await notificarFn({ data: { lead_id: lead.id } });
                toast.success("Corretor notificado via WhatsApp (Evolution).");
              } catch (e: any) { toast.error(e?.message ?? "Falha ao notificar"); }
            }}
          >
            <MessageCircle className="mr-2 size-4" /> Notificar corretor (Evolution)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMostrarTransfer((v) => !v)}
          >
            <ArrowRightLeft className="mr-2 size-4" /> Transferir corretor
          </Button>
        </div>

        {mostrarTransfer && (
          <div className="mb-4 rounded-md border bg-muted/40 p-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              Escolha o novo corretor
            </label>
            <select
              className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
              value={novoCorretor}
              onChange={(e) => setNovoCorretor(e.target.value)}
            >
              <option value="">— Selecione —</option>
              {(corretores ?? []).map((c: any) => (
                <option key={c.id} value={c.id} disabled={!c.ativo}>
                  {c.nome} {c.grupos?.nome ? `· ${c.grupos.nome}` : ""} {c.ativo ? "" : "(inativo)"}
                </option>
              ))}
            </select>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMostrarTransfer(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!novoCorretor || transferirMut.isPending}
                onClick={() => transferirMut.mutate()}
              >
                {transferirMut.isPending ? "Transferindo…" : "Confirmar transferência"}
              </Button>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Nova nota / histórico</label>
          <Textarea
            className="mt-2"
            rows={3}
            placeholder="Ex: Liguei, ficou de retornar amanhã às 10h..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="mt-2 flex justify-between">
            <span className="text-[11px] text-muted-foreground">Salvar reinicia o cronômetro de 6 dias.</span>
            <Button size="sm" disabled={!texto.trim() || criarMut.isPending} onClick={() => criarMut.mutate()}>
              Salvar nota
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico</div>
          <div className="space-y-2">
            {(notas ?? []).length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhuma nota ainda.
              </div>
            )}
            {(notas ?? []).map((n: any) => (
              <div key={n.id} className="rounded-md border bg-muted/30 p-3">
                <div className="whitespace-pre-wrap text-sm">{n.texto}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
