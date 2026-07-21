import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Clock, ShieldCheck, Unlock, UserCheck } from "lucide-react";
import { meuPerfil } from "@/lib/perfis.functions";
import { getConfigAcesso, salvarConfigAcesso, liberarAgora, revogarLiberacao } from "@/lib/config-acesso.functions";
import { listarCorretores, liberarCorretor, revogarLiberacaoCorretor } from "@/lib/corretores.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/acesso")({
  component: AcessoPage,
});

function AcessoPage() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const getFn = useServerFn(getConfigAcesso);
  const salvarFn = useServerFn(salvarConfigAcesso);
  const liberarFn = useServerFn(liberarAgora);
  const revogarFn = useServerFn(revogarLiberacao);
  const listCorretoresFn = useServerFn(listarCorretores);
  const liberarCorretorFn = useServerFn(liberarCorretor);
  const revogarCorretorFn = useServerFn(revogarLiberacaoCorretor);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const { data: config } = useQuery({ queryKey: ["config_acesso"], queryFn: () => getFn() });
  const { data: corretores } = useQuery({ queryKey: ["corretores"], queryFn: () => listCorretoresFn() });

  const [restringir, setRestringir] = useState(true);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("09:30");
  const [minutos, setMinutos] = useState(60);
  const [corretorSel, setCorretorSel] = useState<string>("");
  const [minutosCorretor, setMinutosCorretor] = useState(60);

  useEffect(() => {
    if (!config) return;
    setRestringir(config.restringir_horario);
    setInicio(String(config.hora_inicio).slice(0, 5));
    setFim(String(config.hora_fim).slice(0, 5));
  }, [config]);

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: {
      restringir_horario: restringir,
      hora_inicio: inicio + ":00",
      hora_fim: fim + ":00",
      liberado_ate: config?.liberado_ate ?? null,
    } }),
    onSuccess: () => { toast.success("Configuração salva"); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const liberar = useMutation({
    mutationFn: (m: number) => liberarFn({ data: { minutos: m } }),
    onSuccess: () => { toast.success("Acesso liberado"); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const revogar = useMutation({
    mutationFn: () => revogarFn(),
    onSuccess: () => { toast.success("Liberação revogada"); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
  });

  const liberarUm = useMutation({
    mutationFn: (p: { corretor_id: string; minutos: number }) => liberarCorretorFn({ data: p }),
    onSuccess: () => { toast.success("Corretor liberado"); qc.invalidateQueries({ queryKey: ["corretores"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const revogarUm = useMutation({
    mutationFn: (corretor_id: string) => revogarCorretorFn({ data: { corretor_id } }),
    onSuccess: () => { toast.success("Liberação removida"); qc.invalidateQueries({ queryKey: ["corretores"] }); },
  });

  if (perfil && perfil.role !== "master" && perfil.role !== "gerente") {
    return <div className="rounded-xl border bg-card p-6">Acesso negado.</div>;
  }

  const liberadoAte = config?.liberado_ate ? new Date(config.liberado_ate) : null;
  const liberacaoAtiva = liberadoAte && liberadoAte.getTime() > Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Controle de Acesso</h1>
        <p className="text-sm text-muted-foreground">Defina se corretores e gerentes têm restrição de horário, ou libere o acesso imediatamente.</p>
      </div>

      {/* Liberação imediata */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <Unlock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Liberar agora</h2>
        </div>
        {liberacaoAtiva ? (
          <div className="mb-4 rounded-lg bg-primary/10 p-3 text-sm">
            ✅ Acesso liberado até <strong>{liberadoAte!.toLocaleString("pt-BR")}</strong>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">Nenhuma liberação temporária ativa.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Duração (minutos)</Label>
            <Input type="number" min={5} max={1440} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="w-32" />
          </div>
          <Button onClick={() => liberar.mutate(minutos)} disabled={liberar.isPending}>
            Liberar por {minutos} min
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => liberar.mutate(60)}>1h</Button>
            <Button variant="outline" onClick={() => liberar.mutate(240)}>4h</Button>
            <Button variant="outline" onClick={() => liberar.mutate(1440)}>24h</Button>
          </div>
          {liberacaoAtiva && (
            <Button variant="ghost" onClick={() => revogar.mutate()}>Revogar</Button>
          )}
        </div>
      </div>

      {/* Regra padrão */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Horário padrão de acesso</h2>
        </div>
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Restringir acesso por horário</Label>
            <p className="text-xs text-muted-foreground">Quando desligado, corretores e gerentes acessam a qualquer hora.</p>
          </div>
          <Switch checked={restringir} onCheckedChange={setRestringir} />
        </div>
        {restringir && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" /> Masters sempre têm acesso irrestrito.
          </div>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}
