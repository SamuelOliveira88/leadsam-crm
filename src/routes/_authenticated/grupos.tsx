import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Plus } from "lucide-react";
import { listarGrupos, criarGrupo, excluirGrupo } from "@/lib/grupos.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/grupos")({
  head: () => ({ meta: [{ title: "Grupos — Alexandria Leds" }] }),
  component: Grupos,
});

function Grupos() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const list = useServerFn(listarGrupos);
  const create = useServerFn(criarGrupo);
  const del = useServerFn(excluirGrupo);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const { data } = useQuery({ queryKey: ["grupos"], queryFn: () => list() });
  const [nome, setNome] = useState("");
  const createMut = useMutation({
    mutationFn: () => create({ data: { nome } }),
    onSuccess: () => { setNome(""); qc.invalidateQueries({ queryKey: ["grupos"] }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grupos"] }),
  });

  if (perfil && perfil.role !== "master") {
    return <div className="p-8 text-center text-sm text-muted-foreground">Acesso restrito ao Master.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
        <p className="text-sm text-muted-foreground">Organize corretores em equipes/imobiliárias</p>
      </div>

      <Card className="flex gap-2 p-4">
        <Input placeholder="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Button onClick={() => nome && createMut.mutate()} disabled={createMut.isPending}>
          <Plus className="mr-2 size-4" /> Criar
        </Button>
      </Card>

      <div className="grid gap-2">
        {(data ?? []).map((g) => (
          <Card key={g.id} className="flex items-center justify-between p-4">
            <div className="font-medium">{g.nome}</div>
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(g.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
