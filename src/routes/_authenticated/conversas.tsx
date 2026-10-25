import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, CheckCheck, Clock, MessageCircle, Mic, Send, Square, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { listarConversas, mensagensDoLead, enviarMensagem, enviarAudio, type MensagemConversa } from "@/lib/conversas.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import { tr, localeAtual } from "@/i18n";
export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({ meta: [{ title: tr("Conversas — Alexandria Leds") }] }),
  component: Conversas,
});

function hora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString(localeAtual(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(localeAtual(), { day: "2-digit", month: "2-digit" });
}

function Estado({ m }: { m: MensagemConversa }) {
  if (m.direcao !== "saida") return null;
  if (m.status === "erro") return <TriangleAlert className="size-3 text-destructive" aria-label={tr("Não enviou")} />;
  if (m.status === "pendente") return <Clock className="size-3 opacity-70" aria-label={tr("Enviando")} />;
  return <CheckCheck className="size-3 opacity-70" aria-label={tr("Enviada")} />;
}

function Conversas() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarConversas);
  const msgsFn = useServerFn(mensagensDoLead);
  const envFn = useServerFn(enviarMensagem);
  const audioFn = useServerFn(enviarAudio);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; partes: Blob[]; cancelar: boolean; timer: number } | null>(null);
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
    onError: (e: any) => toast.error(tr(e?.message) || tr("Não consegui enviar.")),
  });

  const mandarAudio = useMutation({
    mutationFn: (v: { mimetype: string; base64: string }) => audioFn({ data: { lead_id: leadId!, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversa", leadId] });
      qc.invalidateQueries({ queryKey: ["conversas"] });
    },
    onError: (e: any) => toast.error(tr(e?.message) || tr("Não consegui enviar o áudio.")),
  });

  const comecarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipos = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"];
      const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t));
      const mr = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      const partes: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const r = rec.current; window.clearInterval(r?.timer);
        setGravando(false); setSeg(0);
        if (!r || r.cancelar || !partes.length) return;
        const blob = new Blob(partes, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 900_000) { toast.error(tr("Áudio muito longo. Grave até 2 minutos.")); return; }
        const dataUrl: string = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob); });
        mandarAudio.mutate({ mimetype: (blob.type || "audio/webm").split(";")[0], base64: dataUrl.split(",")[1] ?? "" });
      };
      const timer = window.setInterval(() => setSeg((x) => {
        if (x + 1 >= 120) mr.state === "recording" && mr.stop();
        return x + 1;
      }), 1000);
      rec.current = { mr, partes, cancelar: false, timer };
      mr.start();
      setGravando(true);
    } catch {
      toast.error(tr("Não consegui usar o microfone. Libere o microfone no navegador."));
    }
  };
  const pararGravacao = (cancelar: boolean) => {
    const r = rec.current; if (!r) return;
    r.cancelar = cancelar;
    if (r.mr.state === "recording") r.mr.stop();
  };

  const podeEnviar = texto.trim().length > 0 && !enviar.isPending;
  const mandar = () => { if (podeEnviar) enviar.mutate(texto.trim()); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tr("Conversas")}</h1>
        <p className="text-sm text-muted-foreground">{tr("Mensagens que chegam no número mãe. Você vê só as dos seus leads.")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        {/* Lista (no celular some quando uma conversa está aberta) */}
        <div className={`grid content-start gap-2 ${leadId ? "hidden md:grid" : ""}`}>
          {isLoading && <Card className="p-6 text-center text-sm text-muted-foreground">{tr("Carregando…")}</Card>}
          {!isLoading && (conversas ?? []).length === 0 && (
            <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <MessageCircle className="size-8 text-muted-foreground/50" />{tr("Nenhuma conversa ainda.")}</Card>
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
                {!c.nova && c.ultima_direcao === "saida" ? tr("Você: ") : ""}{c.ultima_texto}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.nova && <Badge variant="outline" className="text-[10px]">{tr("Novo contato")}</Badge>}
                {c.corretor_id
                  ? <Badge variant="secondary" className="text-[10px]">{c.corretor_nome ?? tr("Corretor")}</Badge>
                  : <Badge variant="destructive" className="text-[10px]">{tr("Sem corretor")}</Badge>}
              </div>
            </Card>
          ))}
        </div>

        {/* Conversa aberta */}
        <Card className={`flex min-h-[60vh] flex-col overflow-hidden ${leadId ? "" : "hidden md:flex"}`}>
          {!atual ? (
            <div className="m-auto flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
              <MessageCircle className="size-8 text-muted-foreground/50" />{tr("Escolha uma conversa.")}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b p-3">
                <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setLeadId(null)} aria-label={tr("Voltar")}>
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
                        {new Date(m.created_at).toLocaleTimeString(localeAtual(), { hour: "2-digit", minute: "2-digit" })}
                        <Estado m={m} />
                      </div>
                      {m.status === "erro" && <div className="mt-1 text-[10px] text-destructive">{tr("Não foi enviada.")}</div>}
                    </div>
                  </div>
                ))}
                <div ref={fim} />
              </div>

              {atual.nova && (
                <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{tr("Este contato ainda não escreveu para o número mãe. Você pode mandar até 5 mensagens antes de ele responder, e até 20 contatos novos por dia.")}</p>
              )}
              {gravando ? (
                <div className="flex items-center gap-2 border-t p-3">
                  <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                  <span className="flex-1 text-sm">{tr("Gravando…")} {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, "0")}</span>
                  <Button variant="ghost" size="icon" onClick={() => pararGravacao(true)} aria-label={tr("Cancelar gravação")}><X className="size-4" /></Button>
                  <Button size="icon" onClick={() => pararGravacao(false)} aria-label={tr("Enviar áudio")}><Square className="size-4" /></Button>
                </div>
              ) : (
              <div className="flex items-end gap-2 border-t p-3">
                <Button variant="outline" size="icon" onClick={comecarGravacao} disabled={atual.nova || mandarAudio.isPending}
                  aria-label={tr("Gravar áudio")} title={atual.nova ? tr("Só dá para mandar áudio a quem já respondeu") : tr("Gravar áudio")}>
                  <Mic className="size-4" />
                </Button>
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
                  placeholder={tr("Escreva a resposta…")}
                  rows={2}
                  maxLength={4000}
                />
                <Button onClick={mandar} disabled={!podeEnviar} aria-label={tr("Enviar")}>
                  {enviar.isPending ? <Check className="size-4" /> : <Send className="size-4" />}
                </Button>
              </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
