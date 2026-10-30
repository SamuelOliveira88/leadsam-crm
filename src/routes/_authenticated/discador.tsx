import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Headphones, Mic, MicOff, Phone, PhoneOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { tr } from "@/i18n";
import { RESULTADOS_DISCADOR, LIMITES_DISCADOR } from "@/lib/discador";
import { definirEstado, leadsParaDiscar, ligarLead, marcarResultado, meuDiscador, minhaChamadaAtual } from "@/lib/discador.functions";

export const Route = createFileRoute("/_authenticated/discador")({
  head: () => ({ meta: [{ title: tr("Discador | Alexandria Leds") }] }),
  component: DiscadorPage,
});

type StatusFone = "desligado" | "conectando" | "registrado" | "erro";

/**
 * Telefone no navegador (JsSIP). Registra o ramal direto no Asterisk por WebSocket seguro
 * e atende sozinho a ligação que o servidor manda (o lead já está na linha).
 * A biblioteca fica em /vendor (mesmo domínio) e só carrega quando o corretor liga o telefone.
 */
function useTelefone(meu: { ramal: string; senha: string; wss: string | null; dominio: string | null; iceServers: any[] } | undefined) {
  const [status, setStatus] = useState<StatusFone>("desligado");
  const [erro, setErro] = useState<string | null>(null);
  const [emLigacao, setEmLigacao] = useState(false);
  const [mudo, setMudo] = useState(false);
  const uaRef = useRef<any>(null);
  const sessaoRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = document.createElement("audio");
    el.autoplay = true;
    audioRef.current = el;
    return () => {
      el.srcObject = null;
      uaRef.current?.stop();
    };
  }, []);

  async function carregarBiblioteca(): Promise<any> {
    const w = window as any;
    if (w.JsSIPLib) return w.JsSIPLib;
    await new Promise<void>((ok, falha) => {
      const s = document.createElement("script");
      s.src = "/vendor/jssip-3.10.1.min.js";
      s.onload = () => ok();
      s.onerror = () => falha(new Error("Não consegui carregar o telefone."));
      document.head.appendChild(s);
    });
    return w.JsSIPLib;
  }

  async function ligarTelefone() {
    if (!meu?.wss || !meu.dominio) {
      setErro(tr("O servidor de voz ainda não foi configurado."));
      setStatus("erro");
      return;
    }
    setStatus("conectando");
    setErro(null);
    try {
      // Pede o microfone agora, com o clique do corretor (o navegador só libera áudio depois de um clique).
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => t.stop());
      const JsSIP = await carregarBiblioteca();
      uaRef.current?.stop();
      const ua = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(meu.wss)],
        uri: `sip:${meu.ramal}@${meu.dominio}`,
        authorization_user: meu.ramal,
        password: meu.senha,
        register: true,
        session_timers: false,
        // Reconecta sozinho se a internet cair (espera de 2s a 30s entre tentativas).
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
      });
      ua.on("registered", () => setStatus("registrado"));
      ua.on("unregistered", () => setStatus("conectando"));
      ua.on("registrationFailed", () => {
        setStatus("erro");
        setErro(tr("O servidor de voz recusou o telefone."));
      });
      ua.on("disconnected", () => setStatus((s) => (s === "registrado" ? "conectando" : s)));
      ua.on("newRTCSession", (e: any) => {
        if (e.originator !== "remote") return;
        const sessao = e.session;
        sessaoRef.current = sessao;
        sessao.on("peerconnection", (pc: any) => {
          pc.peerconnection.addEventListener("track", (ev: any) => {
            if (audioRef.current && ev.streams[0]) {
              audioRef.current.srcObject = ev.streams[0];
              audioRef.current.play().catch(() => {});
            }
          });
        });
        const fim = () => {
          sessaoRef.current = null;
          setEmLigacao(false);
          setMudo(false);
          if (audioRef.current) audioRef.current.srcObject = null;
        };
        sessao.on("ended", fim);
        sessao.on("failed", fim);
        // O lead já atendeu: o corretor entra na linha automaticamente.
        sessao.answer({ mediaConstraints: { audio: true, video: false }, pcConfig: { iceServers: meu.iceServers } });
        setEmLigacao(true);
      });
      ua.start();
      uaRef.current = ua;
    } catch (e: any) {
      setStatus("erro");
      setErro(e?.name === "NotAllowedError" ? tr("Libere o microfone no navegador e tente de novo.") : (e?.message ?? tr("Falha ao ligar o telefone.")));
    }
  }

  function desligarTelefone() {
    sessaoRef.current?.terminate();
    uaRef.current?.stop();
    uaRef.current = null;
    setStatus("desligado");
  }

  function alternarMudo() {
    const s = sessaoRef.current;
    if (!s) return;
    if (mudo) s.unmute({ audio: true });
    else s.mute({ audio: true });
    setMudo(!mudo);
  }

  return { status, erro, emLigacao, mudo, ligarTelefone, desligarTelefone, alternarMudo, desligarChamada: () => sessaoRef.current?.terminate() };
}

function DiscadorPage() {
  const qc = useQueryClient();
  const meuFn = useServerFn(meuDiscador);
  const estadoFn = useServerFn(definirEstado);
  const leadsFn = useServerFn(leadsParaDiscar);
  const ligarFn = useServerFn(ligarLead);
  const atualFn = useServerFn(minhaChamadaAtual);
  const resultadoFn = useServerFn(marcarResultado);
  const [busca, setBusca] = useState("");

  const { data: meu } = useQuery({ queryKey: ["discador-meu"], queryFn: () => meuFn(), refetchInterval: 4000 });
  const { data: chamada } = useQuery({ queryKey: ["discador-atual"], queryFn: () => atualFn(), refetchInterval: 1500 });
  const { data: leads, isLoading: carregandoLeads } = useQuery({
    queryKey: ["discador-leads", busca],
    queryFn: () => leadsFn({ data: { busca: busca || undefined } }),
  });
  const fone = useTelefone(meu);

  const estadoMut = useMutation({
    mutationFn: (estado: "pronto" | "pausa" | "offline") => estadoFn({ data: { estado } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discador-meu"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const ligarMut = useMutation({
    mutationFn: (lead_id: string) => ligarFn({ data: { lead_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discador-atual"] });
      qc.invalidateQueries({ queryKey: ["discador-meu"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const resultadoMut = useMutation({
    mutationFn: (v: { chamada_id: string; resultado: string }) => resultadoFn({ data: v }),
    onSuccess: () => {
      toast.success(tr("Ligação registrada."));
      qc.invalidateQueries({ queryKey: ["discador-atual"] });
      qc.invalidateQueries({ queryKey: ["discador-meu"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Se o telefone cair enquanto o corretor está "Pronto", ele sai de Pronto (não liga para quem não ouve).
  const estado = meu?.estado ?? "offline";
  useEffect(() => {
    if (fone.status !== "registrado" && estado === "pronto" && !fone.emLigacao) estadoMut.mutate("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fone.status]);

  const naLinha = chamada && (chamada.status === "pedida" || chamada.status === "discando" || chamada.status === "atendida");
  const aguardandoResultado = chamada && (chamada.status === "encerrada" || chamada.status === "falhou");
  const podeLigar = fone.status === "registrado" && estado === "pronto" && !naLinha && !aguardandoResultado;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Headphones className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{tr("Discador")}</h1>
      </div>

      {meu && !meu.configurado && (
        <Card className="border-amber-500 p-4 text-sm">
          {tr("O servidor de voz ainda não foi ligado. Peça ao administrador para configurar o discador.")}
        </Card>
      )}

      {/* 1. Telefone e estado */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">{tr("Seu telefone")}</div>
            <div className="text-sm text-muted-foreground">
              {fone.status === "registrado" && tr("Conectado")}
              {fone.status === "conectando" && tr("Conectando...")}
              {fone.status === "desligado" && tr("Desligado")}
              {fone.status === "erro" && (fone.erro ?? tr("Erro"))}
            </div>
          </div>
          {fone.status === "registrado" ? (
            <Button variant="outline" onClick={fone.desligarTelefone} disabled={fone.emLigacao}>
              {tr("Desligar telefone")}
            </Button>
          ) : (
            <Button onClick={fone.ligarTelefone} disabled={!meu?.configurado || fone.status === "conectando"}>
              <Phone className="mr-1 h-4 w-4" /> {tr("Ligar o telefone")}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={estado === "pronto" ? "default" : "outline"}
            disabled={fone.status !== "registrado" || estadoMut.isPending || !!naLinha}
            onClick={() => estadoMut.mutate("pronto")}
          >
            {tr("Pronto")}
          </Button>
          <Button
            variant={estado === "pausa" ? "default" : "outline"}
            disabled={estadoMut.isPending || !!naLinha}
            onClick={() => estadoMut.mutate("pausa")}
          >
            {tr("Pausa")}
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {estado === "ocupado" && tr("Em ligação")}
            {estado === "preenchendo" && tr("Marque o resultado para continuar")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr("Deixe esta aba aberta enquanto estiver ligando. O discador liga de segunda a sexta, das {a}h às {b}h.", {
            a: LIMITES_DISCADOR.horaInicio,
            b: LIMITES_DISCADOR.horaFim,
          })}
        </p>
      </Card>

      {/* 2. Ligação em andamento */}
      {naLinha && chamada && (
        <Card className="space-y-3 border-green-600 p-4">
          <div className="font-semibold">{chamada.lead_nome}</div>
          <div className="text-sm text-muted-foreground">
            {chamada.status === "atendida" || fone.emLigacao ? tr("Falando...") : tr("Ligando para o cliente...")}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fone.alternarMudo} disabled={!fone.emLigacao}>
              {fone.mudo ? <MicOff className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}
              {fone.mudo ? tr("Ativar microfone") : tr("Silenciar")}
            </Button>
            <Button variant="destructive" onClick={fone.desligarChamada} disabled={!fone.emLigacao}>
              <PhoneOff className="mr-1 h-4 w-4" /> {tr("Desligar")}
            </Button>
          </div>
        </Card>
      )}

      {/* 3. Resultado */}
      {aguardandoResultado && chamada && (
        <Card className="space-y-3 border-primary p-4">
          <div className="font-semibold">{tr("Como foi a ligação com {nome}?", { nome: chamada.lead_nome })}</div>
          {chamada.status === "falhou" && (
            <div className="text-sm text-muted-foreground">{chamada.motivo_falha ?? tr("A ligação não completou.")}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {RESULTADOS_DISCADOR.map((r) => (
              <Button
                key={r.id}
                variant="outline"
                disabled={resultadoMut.isPending}
                onClick={() => resultadoMut.mutate({ chamada_id: chamada.id, resultado: r.id })}
              >
                {tr(r.rotulo)}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* 4. Lista de leads */}
      <Card className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={tr("Buscar lead pelo nome")} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {carregandoLeads && <div className="text-sm text-muted-foreground">{tr("Carregando...")}</div>}
        <ul className="divide-y">
          {(leads ?? []).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{[l.cidade, l.status].filter(Boolean).join(" · ")}</div>
              </div>
              <Button
                size="sm"
                disabled={!podeLigar || l.bloqueado || ligarMut.isPending}
                title={l.bloqueado ? tr("Este lead não pode ser discado") : undefined}
                onClick={() => ligarMut.mutate(l.id)}
              >
                <Phone className="mr-1 h-4 w-4" /> {tr("Ligar")}
              </Button>
            </li>
          ))}
          {leads && leads.length === 0 && <li className="py-4 text-sm text-muted-foreground">{tr("Nenhum lead encontrado.")}</li>}
        </ul>
      </Card>
    </div>
  );
}
