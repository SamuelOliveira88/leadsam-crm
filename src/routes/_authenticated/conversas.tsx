import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, CheckCheck, Clock, MessageCircle, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { listarConversas, mensagensDoLead, enviarMensagem, type MensagemConversa } from "@/lib/conversas.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({ meta: [{ title: "Conversas — Alexandria Leds" }] }),
  component: Conversas,
});

function hora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Estado({ m }: { m: MensagemConversa }) {
  if (m.direcao !== "saida") return null;
  if (m.status === "erro") return <TriangleAlert className="size-3 text-destructive" aria-label="Não enviou" />;
  if (m.status === "pendente") return <Clock className="size-3 opacity-70" aria-label="Enviando" />;
  return <CheckCheck className="size-3 opacity-70" aria-label="Enviada" />;
}

function Conversas() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarConversas);
  const msgsFn = useServerFn(mensagensDoLead);
  const envFn = useServerFn(enviarMensagem);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const { data: conversas, isLoading } = useQuery({
    queryKey: ["conversas"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });
  const { data: msgs } = useQuery({
    queryKey: ["conversa", leadId],
    queryFn: () => msgsFn({ data: { lead_id: leadId! } }),
    enabled: !!leadId,
    refetchInterval: 4000,
  });
  const atual = (conversas ?? []).find((c) => c.lead_id === leadId) ?? null;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length, leadId]);

  const enviar = useMutation({
    mutationFn: (t: string) => envFn({ data: { lead_id: leadId!, texto: t } }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["conversa", leadId] });
      qc.invalidateQueries({ queryKey: ["conversas"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não consegui enviar."),
  });

  const podeEnviar = texto.trim().length > 0 && !enviar.isPending;
  const mandar = () => { if (podeEnviar) enviar.mutate(texto.trim()); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
        <p className="text-sm text-muted-foreground">Mensagens que chegam no número mãe. Você vê só as dos seus leads.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        {/* Lista (no celular some quando uma conversa está aberta) */}
        <div className={`grid content-start gap-2 ${leadId ? "hidden md:grid" : ""}`}>
          {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">Carregando…</Card>}
          {!isLoading && (conversas ?? []).length === 0 && (
            <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <MessageCircle className="size-8 text-muted-foreground/50" />
              Nenhuma conversa ainda.
            </Card>
          )}
          {(conversas ?? []).map((c) => (
            <Card
              key={c.lead_id}
              onClick={() => setLeadId(c.lead_id)}
              className={`cursor-pointer p-3 transition-colors hover:bg-muted/50 ${c.lead_id === leadId ? "border-primary/50 bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{c.nome}</div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{hora(c.ultima_em)}</div>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {c.ultima_direcao === "saida" ? "Você: " : ""}{c.ultima_texto}
              </div>
              <div className="mt-1.5">
                {c.corretor_id
                  ? <Badge variant="secondary" className="text-[10px]">{c.corretor_nome ?? "Corretor"}</Badge>
                  : <Badge variant="destructive" className="text-[10px]">Sem corretor</Badge>}
              </div>
            </Card>
          ))}
        </div>

        {/* Conversa aberta */}
        <Card className={`flex min-h-[60vh] flex-col overflow-hidden ${leadId ? "" : "hidden md:flex"}`}>
          {!atual ? (
            <div className="m-auto flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
              <MessageCircle className="size-8 text-muted-foreground/50" />
              Escolha uma conversa.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b p-3">
                <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setLeadId(null)} aria-label="Voltar">
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{atual.nome}</div>
                  {atual.telefone && <div className="truncate text-xs text-muted-foreground">{atual.telefone}</div>}
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3" style={{ maxHeight: "55vh" }}>
                {(msgs ?? []).map((m) => (
                  <div key={m.id} className={`flex ${m.direcao === "saida" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direcao === "saida" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                      {m.direcao === "saida" && m.corretor_nome && (
                        <div className="mb-0.5 text-[10px] font-semibold opacity-80">{m.corretor_nome}</div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        <Estado m={m} />
                      </div>
                      {m.status === "erro" && <div className="mt-1 text-[10px] text-destructive">Não foi enviada.</div>}
                    </div>
                  </div>
                ))}
                <div ref={fim} />
              </div>

              <div className="flex items-end gap-2 border-t p-3">
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
                  placeholder="Escreva a resposta…"
                  rows={2}
                  maxLength={4000}
                />
                <Button onClick={mandar} disabled={!podeEnviar} aria-label="Enviar">
                  {enviar.isPending ? <Check className="size-4" /> : <Send className="size-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
