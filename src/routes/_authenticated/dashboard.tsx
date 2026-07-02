import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, TrendingUp, Users, HandshakeIcon, Wallet, Loader2 } from "lucide-react";
import { metricasDashboard } from "@/lib/metricas.functions";
import { listarLeads } from "@/lib/leads.functions";
import { gerarSugestaoDashboard } from "@/lib/ai.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ESTAGIO_COLORS, ESTAGIO_LABELS, formatBRL } from "@/lib/formatters";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ImobLead" }] }),
  component: Dashboard,
});

function Metric({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-lg ${tone}`}><Icon className="size-5" /></div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const metricasFn = useServerFn(metricasDashboard);
  const leadsFn = useServerFn(listarLeads);
  const sugestaoFn = useServerFn(gerarSugestaoDashboard);
  const qc = useQueryClient();

  const metricas = useQuery({ queryKey: ["metricas"], queryFn: () => metricasFn() });
  const leads = useQuery({ queryKey: ["leads"], queryFn: () => leadsFn() });

  const sugestao = useMutation({
    mutationFn: () => sugestaoFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sugestao"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Olá! Aqui está seu resumo</h1>
        <p className="text-sm text-muted-foreground">Veja o pulso da sua operação em tempo real.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label="Total de leads" value={String(metricas.data?.total ?? "—")} tone="bg-primary-soft text-primary" />
        <Metric icon={HandshakeIcon} label="Em proposta" value={String(metricas.data?.emProposta ?? "—")} tone="bg-accent/20 text-accent-foreground" />
        <Metric icon={TrendingUp} label="Fechados" value={String(metricas.data?.fechados ?? "—")} tone="bg-success/15 text-success" />
        <Metric icon={Wallet} label="VGV estimado" value={formatBRL(metricas.data?.vgv ?? 0)} tone="bg-secondary text-secondary-foreground" />
      </div>

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary-soft via-card to-card p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Sugestão da IA</h3>
                <p className="text-xs text-muted-foreground">Ação prioritária baseada nos seus leads.</p>
              </div>
              <Button size="sm" onClick={() => sugestao.mutate()} disabled={sugestao.isPending}>
                {sugestao.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Gerando…</> : "Gerar"}
              </Button>
            </div>
            <div className="mt-4 min-h-[3.5rem] rounded-lg bg-card/60 p-4 text-sm">
              {sugestao.data?.sugestao ?? <span className="text-muted-foreground">Clique em "Gerar" para receber uma sugestão personalizada.</span>}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Leads recentes</h3>
          <a href="/leads" className="text-sm font-medium text-primary hover:underline">Ver todos</a>
        </div>
        <div className="space-y-2">
          {leads.isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>}
          {!leads.isLoading && (leads.data ?? []).slice(0, 6).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{l.telefone} • {l.origem}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={ESTAGIO_COLORS[l.estagio]}>{ESTAGIO_LABELS[l.estagio]}</Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
          {!leads.isLoading && (leads.data ?? []).length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhum lead ainda. Cadastre o primeiro na aba Leads.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
