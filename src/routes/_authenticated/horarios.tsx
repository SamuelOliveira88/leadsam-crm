import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarGrupos } from "@/lib/grupos.functions";
import { listarHorarios, upsertHorario } from "@/lib/horarios.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const Route = createFileRoute("/_authenticated/horarios")({
  head: () => ({ meta: [{ title: "Horários — Alexandria Leds" }] }),
  component: Horarios,
});

function Horarios() {
  const qc = useQueryClient();
  const gruposFn = useServerFn(listarGrupos);
  const listFn = useServerFn(listarHorarios);
  const saveFn = useServerFn(upsertHorario);
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => gruposFn() });
  const [grupoId, setGrupoId] = useState("");
  useEffect(() => { if (!grupoId && grupos?.[0]) setGrupoId(grupos[0].id); }, [grupos, grupoId]);

  const { data: horarios } = useQuery({
    queryKey: ["horarios", grupoId], queryFn: () => listFn({ data: { grupo_id: grupoId } }),
    enabled: !!grupoId,
  });

  const saveMut = useMutation({
    mutationFn: (h: any) => saveFn({ data: h }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["horarios", grupoId] }),
  });

  function horarioDia(d: number) {
    return (horarios ?? []).find((h: any) => h.dia_semana === d) ?? { dia_semana: d, hora_inicio: "08:00:00", hora_fim: "18:00:00", ativo: false };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Horários de atendimento</h1>
        <p className="text-sm text-muted-foreground">Fora desses horários, os leads são represados e liberados automaticamente</p>
      </div>

      <Card className="p-4">
        <label className="mb-2 block text-xs font-medium">Grupo</label>
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm md:w-96" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
          {(grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </Card>

      {grupoId && (
        <div className="grid gap-2">
          {DIAS.map((d, i) => {
            const h = horarioDia(i);
            return (
              <Card key={i} className="flex flex-wrap items-center gap-3 p-3">
                <div className="w-12 font-semibold">{d}</div>
                <Input type="time" defaultValue={String(h.hora_inicio).slice(0, 5)} className="w-32"
                  onBlur={(e) => saveMut.mutate({ grupo_id: grupoId, dia_semana: i, hora_inicio: e.target.value + ":00", hora_fim: String(h.hora_fim).slice(0, 5) + ":00", ativo: h.ativo })} />
                <span>até</span>
                <Input type="time" defaultValue={String(h.hora_fim).slice(0, 5)} className="w-32"
                  onBlur={(e) => saveMut.mutate({ grupo_id: grupoId, dia_semana: i, hora_inicio: String(h.hora_inicio).slice(0, 5) + ":00", hora_fim: e.target.value + ":00", ativo: h.ativo })} />
                <Button size="sm" variant={h.ativo ? "default" : "outline"}
                  onClick={() => saveMut.mutate({ grupo_id: grupoId, dia_semana: i, hora_inicio: String(h.hora_inicio).slice(0, 5) + ":00", hora_fim: String(h.hora_fim).slice(0, 5) + ":00", ativo: !h.ativo })}>
                  {h.ativo ? "Ativo" : "Inativo"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
