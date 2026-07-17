import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { listarLeads, excluirLead } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — ImobLead" }] }),
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">Todos os leads recebidos e sua distribuição</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <div className="grid gap-3">
        {(data ?? []).map((l: any) => (
          <Card key={l.id} className="flex items-center justify-between p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-semibold">{l.nome}</div>
                <Badge variant={l.status === "represado" ? "secondary" : "default"}>{l.status}</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {l.telefone ?? "—"} · {l.grupos?.nome ?? "Sem grupo"} · {l.corretores?.nome ?? "não atribuído"}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(l.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </Card>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum lead ainda.</Card>
        )}
      </div>
    </div>
  );
}
