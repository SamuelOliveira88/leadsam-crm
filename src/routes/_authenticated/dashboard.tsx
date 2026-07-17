import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Clock, TrendingUp } from "lucide-react";
import { dashboardStats } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ImobLead" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchStats = useServerFn(dashboardStats);
  const { data, isLoading } = useQuery({ queryKey: ["dash"], queryFn: () => fetchStats() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da distribuição de leads</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Total de leads</div>
              <div className="text-2xl font-bold">{isLoading ? "…" : data?.total ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-600"><Clock className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Represados</div>
              <div className="text-2xl font-bold">{isLoading ? "…" : data?.represados ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-green-500/10 text-green-600"><TrendingUp className="size-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">Recebidos hoje</div>
              <div className="text-2xl font-bold">{isLoading ? "…" : data?.hoje ?? 0}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Leads por corretor</h2>
        <div className="divide-y">
          {(data?.corretores ?? []).map((c: any) => (
            <div key={c.corretor_id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{c.corretor}</div>
                <div className="text-xs text-muted-foreground">{c.grupo ?? "Sem grupo"}</div>
              </div>
              <div className="text-lg font-bold tabular-nums">{c.total_leads ?? 0}</div>
            </div>
          ))}
          {(data?.corretores ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Sem corretores cadastrados ainda.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
