import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, X, Sparkles, MessageCircle, Eye } from "lucide-react";
import { listarLeads, excluirLead } from "@/lib/leads.functions";
import { listarNotas, criarNota, marcarLeadVisualizado, gerarMensagemAbertura } from "@/lib/notas.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Alexandria Leds" }] }),
  component: Leads,
});

function Leads() {
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listarLeads);
  const del = useServerFn(excluirLead);
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => fetchLeads() });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
  const [openLead, setOpenLead] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">Toque em um lead para abrir o histórico e gerar mensagem</p>
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
                {!l.visualizado_em && l.corretor_id && (
                  <Badge variant="outline" className="border-orange-400 text-orange-600">novo</Badge>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {l.telefone ?? "—"} · {l.grupos?.nome ?? "Sem grupo"} · {l.corretores?.nome ?? "não atribuído"}
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
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);

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
        </div>

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
