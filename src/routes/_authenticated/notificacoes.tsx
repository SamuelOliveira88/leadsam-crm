import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, CheckCheck } from "lucide-react";
import { listarNotificacoes, marcarNotificacaoLida, marcarTodasLidas } from "@/lib/notificacoes.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Alexandria Leds" }] }),
  component: Notificacoes,
});

function Notificacoes() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarNotificacoes);
  const lidaFn = useServerFn(marcarNotificacaoLida);
  const todasFn = useServerFn(marcarTodasLidas);
  const { data } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });
  const lidaMut = useMutation({
    mutationFn: (id: string) => lidaFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
  });
  const todasMut = useMutation({
    mutationFn: () => todasFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  const naoLidas = (data ?? []).filter((n) => !n.lida).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {naoLidas > 0 ? `${naoLidas} nova${naoLidas > 1 ? "s" : ""}` : "Tudo em dia"}
          </p>
        </div>
        {naoLidas > 0 && (
          <Button variant="outline" size="sm" onClick={() => todasMut.mutate()}>
            <CheckCheck className="mr-2 size-4" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {(data ?? []).length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Bell className="size-8 text-muted-foreground/50" />
            Nenhuma notificação por aqui.
          </Card>
        )}
        {(data ?? []).map((n) => (
          <Card key={n.id} className={`flex items-center justify-between gap-3 p-4 ${!n.lida ? "border-primary/40 bg-primary/5" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-semibold">{n.titulo}</div>
                {!n.lida && <Badge variant="default" className="text-[10px]">nova</Badge>}
              </div>
              {n.descricao && <div className="mt-1 truncate text-xs text-muted-foreground">{n.descricao}</div>}
              <div className="mt-1 text-[11px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
            {!n.lida && (
              <Button size="icon" variant="ghost" onClick={() => lidaMut.mutate(n.id)} title="Marcar como lida">
                <Check className="size-4" />
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
