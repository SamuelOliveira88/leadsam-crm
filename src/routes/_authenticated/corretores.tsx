import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Plus } from "lucide-react";
import { listarCorretores, criarCorretor, atualizarCorretor, excluirCorretor } from "@/lib/corretores.functions";
import { listarGrupos } from "@/lib/grupos.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/corretores")({
  head: () => ({ meta: [{ title: "Corretores — ImobLead" }] }),
  component: Corretores,
});

function Corretores() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarCorretores);
  const gruposFn = useServerFn(listarGrupos);
  const createFn = useServerFn(criarCorretor);
  const updateFn = useServerFn(atualizarCorretor);
  const delFn = useServerFn(excluirCorretor);
  const { data } = useQuery({ queryKey: ["corretores"], queryFn: () => listFn() });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => gruposFn() });

  const [form, setForm] = useState({ nome: "", telefone: "", grupo_id: "", canal_notificacao: "whatsapp" as const });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {
      nome: form.nome, telefone: form.telefone || null,
      grupo_id: form.grupo_id || null, ativo: true, canal_notificacao: form.canal_notificacao,
    } }),
    onSuccess: () => { setForm({ nome: "", telefone: "", grupo_id: "", canal_notificacao: "whatsapp" }); qc.invalidateQueries({ queryKey: ["corretores"] }); },
  });
  const toggleMut = useMutation({
    mutationFn: (c: any) => updateFn({ data: { id: c.id, patch: { ativo: !c.ativo } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corretores"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corretores"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Corretores</h1>
        <p className="text-sm text-muted-foreground">Cadastre e gerencie os corretores da equipe</p>
      </div>

      <Card className="grid gap-2 p-4 md:grid-cols-5">
        <Input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Input placeholder="WhatsApp (55...)" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.grupo_id} onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}>
          <option value="">Sem grupo</option>
          {(grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.canal_notificacao} onChange={(e) => setForm({ ...form, canal_notificacao: e.target.value as any })}>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
          <option value="ambos">Ambos</option>
          <option value="nenhum">Nenhum</option>
        </select>
        <Button onClick={() => form.nome && createMut.mutate()}><Plus className="mr-2 size-4" /> Adicionar</Button>
      </Card>

      <div className="grid gap-2">
        {(data ?? []).map((c: any) => (
          <Card key={c.id} className="flex items-center justify-between p-4">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {c.nome}
                <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "ativo" : "inativo"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.telefone ?? "—"} · {c.grupos?.nome ?? "Sem grupo"} · {c.canal_notificacao}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggleMut.mutate(c)}>
                {c.ativo ? "Desativar" : "Ativar"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(c.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
