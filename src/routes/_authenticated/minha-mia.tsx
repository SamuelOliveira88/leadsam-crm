import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequireAdmin } from "@/components/RequireAdmin";
import { meuPerfil } from "@/lib/perfis.functions";
import { testarMia } from "@/lib/mia-empresa.functions";
import { PERGUNTAS_MIA, HORARIO_PADRAO, DIAS_SEMANA, type RespostasMia, type HorarioMia } from "@/lib/mia-empresa";

export const Route = createFileRoute("/_authenticated/minha-mia")({
  head: () => ({ meta: [{ title: "Minha Mi.IA — Alexandria Leds" }] }),
  component: () => <RequireAdmin><MinhaMia /></RequireAdmin>,
});

type Msg = { papel: "cliente" | "mia"; texto: string };

function MinhaMia() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const testarFn = useServerFn(testarMia);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const empresaId = perfil?.empresa_id ?? null;

  const { data: plano } = useQuery({
    queryKey: ["meu-plano"],
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("meu_plano"); if (error) throw new Error(error.message); return data as { mia: boolean } | null; },
  });
  const { data: cfg, isLoading } = useQuery({
    enabled: !!empresaId,
    queryKey: ["mia-config", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mia_config").select("respostas, site_referencia, ativa, horario").eq("empresa_id", empresaId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { respostas: RespostasMia; site_referencia: string | null; ativa: boolean; horario: HorarioMia } | null;
    },
  });

  const [resp, setResp] = useState<RespostasMia>({});
  const [site, setSite] = useState("");
  const [ativa, setAtiva] = useState(false);
  const [horario, setHorario] = useState<HorarioMia>(HORARIO_PADRAO);
  useEffect(() => {
    if (!cfg) return;
    setResp(cfg.respostas ?? {}); setSite(cfg.site_referencia ?? ""); setAtiva(!!cfg.ativa); setHorario({ ...HORARIO_PADRAO, ...(cfg.horario ?? {}) });
  }, [cfg]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("mia_config").upsert({
        empresa_id: empresaId, respostas: resp, site_referencia: site.trim() || null, ativa, horario,
      }, { onConflict: "empresa_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Mi.IA salva."); qc.invalidateQueries({ queryKey: ["mia-config"] }); },
    onError: (e: any) => toast.error(e?.message || "Não consegui salvar."),
  });

  // Conversa de teste
  const [chat, setChat] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const enviar = useMutation({
    mutationFn: (msgs: Msg[]) => testarFn({ data: { mensagens: msgs } }),
    onSuccess: (r, msgs) => setChat([...msgs, { papel: "mia", texto: r.resposta + (r.passar ? "\n\n➡️ (Aqui a Mi.IA passaria o cliente para um corretor.)" : "") }]),
    onError: (e: any) => toast.error(e?.message || "A Mi.IA não respondeu."),
  });
  const mandar = () => {
    const t = texto.trim(); if (!t || enviar.isPending) return;
    const msgs = [...chat, { papel: "cliente" as const, texto: t }];
    setChat(msgs); setTexto(""); enviar.mutate(msgs);
  };

  const liberada = !!plano?.mia;
  const alternaDia = (d: number) => setHorario((h) => ({ ...h, dias: h.dias.includes(d) ? h.dias.filter((x) => x !== d) : [...h.dias, d].sort() }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Bot className="size-6" /> Minha Mi.IA</h1>
        <p className="text-sm text-muted-foreground">Responda as 8 perguntas. A Mi.IA usa o que você escrever para atender o cliente antes de passar para o corretor.</p>
      </div>

      {plano && !liberada && (
        <Card className="border-primary/40 bg-primary/5 p-4 text-sm">
          A Mi.IA faz parte do plano <b>Alexandria + Mi.IA</b> (R$ 499/mês). Você pode preencher as respostas agora, mas só liga com o plano.{" "}
          <Link to="/meu-plano" className="font-medium underline">Ver planos</Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {isLoading ? "Carregando…" : PERGUNTAS_MIA.map((p) => (
            <Card key={p.id} className="space-y-1.5 p-4">
              <div className="text-sm font-semibold">{p.titulo} <span className="font-normal text-muted-foreground">— {p.ajuda}</span></div>
              <Textarea rows={p.id === "empreendimentos" ? 4 : 2} maxLength={1500} value={resp[p.id] ?? ""}
                onChange={(e) => setResp((r) => ({ ...r, [p.id]: e.target.value }))} placeholder={`Ex.: ${p.exemplo}`} />
            </Card>
          ))}
          <Card className="space-y-1.5 p-4">
            <div className="text-sm font-semibold">Site da imobiliária <span className="font-normal text-muted-foreground">— opcional, endereço para consulta</span></div>
            <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://www.suaimobiliaria.com.br" maxLength={200} />
          </Card>

          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold">Quando a Mi.IA atende</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={horario.sempre} onChange={(e) => setHorario((h) => ({ ...h, sempre: e.target.checked }))} /> O dia todo, todos os dias</label>
            {!horario.sempre && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((n, d) => (
                    <Button key={d} type="button" size="sm" variant={horario.dias.includes(d) ? "default" : "outline"} onClick={() => alternaDia(d)}>{n}</Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  das <Input type="time" className="w-28" value={horario.inicio} onChange={(e) => setHorario((h) => ({ ...h, inicio: e.target.value }))} />
                  às <Input type="time" className="w-28" value={horario.fim} onChange={(e) => setHorario((h) => ({ ...h, fim: e.target.value }))} />
                  <span className="text-xs text-muted-foreground">(horário de Brasília)</span>
                </div>
                <p className="text-xs text-muted-foreground">Fora desse horário o lead segue direto para os corretores, como hoje.</p>
              </div>
            )}
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={ativa} disabled={!liberada} onChange={(e) => setAtiva(e.target.checked)} />
              Mi.IA ligada (atende os leads novos antes do corretor)
            </label>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !empresaId}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          </Card>
        </div>

        <Card className="flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-4">
          <div className="text-sm font-semibold">Teste a sua Mi.IA</div>
          <p className="text-xs text-muted-foreground">Salve as respostas e converse como se fosse um cliente. Ajuste o que não ficou bom.</p>
          <div className="max-h-[420px] min-h-[200px] space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            {chat.length === 0 && <div className="text-muted-foreground">Escreva, por exemplo: “Oi, vi um anúncio de vocês.”</div>}
            {chat.map((m, i) => (
              <div key={i} className={m.papel === "cliente" ? "ml-8 rounded-lg bg-primary/10 p-2" : "mr-8 whitespace-pre-wrap rounded-lg bg-muted p-2"}>{m.texto}</div>
            ))}
            {enviar.isPending && <div className="text-muted-foreground">Mi.IA está digitando…</div>}
          </div>
          <div className="flex gap-2">
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mandar()} placeholder="Mensagem do cliente" maxLength={500} disabled={!liberada} />
            <Button onClick={mandar} disabled={!liberada || enviar.isPending}><Send className="size-4" /></Button>
          </div>
          {!liberada && <p className="text-xs text-muted-foreground">O teste libera com o plano com a Mi.IA ou durante os 7 dias grátis.</p>}
          <Button variant="outline" size="sm" onClick={() => setChat([])}>Limpar conversa</Button>
        </Card>
      </div>
    </div>
  );
}
