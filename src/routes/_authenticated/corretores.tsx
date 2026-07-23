import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Plus, Layers, X, Mail, UserCog } from "lucide-react";
import { listarCorretores, criarCorretor, atualizarCorretor, excluirCorretor } from "@/lib/corretores.functions";
import { listarGrupos, criarGrupo, excluirGrupo } from "@/lib/grupos.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/corretores")({
  head: () => ({ meta: [{ title: "Corretores — Alexandria Leds" }] }),
  component: Corretores,
});

function Corretores() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarCorretores);
  const gruposFn = useServerFn(listarGrupos);
  const createFn = useServerFn(criarCorretor);
  const updateFn = useServerFn(atualizarCorretor);
  const delFn = useServerFn(excluirCorretor);
  const perfilFn = useServerFn(meuPerfil);
  const { data } = useQuery({ queryKey: ["corretores"], queryFn: () => listFn() });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => gruposFn() });
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const isMaster = perfil?.role === "master";
  const [showGrupos, setShowGrupos] = useState(false);

  const [form, setForm] = useState({ nome: "", email: "", telefone: "", grupo_id: "", canal_notificacao: "whatsapp" as const, recebe_via_web: true, recebe_via_whatsapp: true, role: "corretor" as "corretor" | "gerente" });
  const resetForm = () => setForm({ nome: "", email: "", telefone: "", grupo_id: "", canal_notificacao: "whatsapp", recebe_via_web: true, recebe_via_whatsapp: true, role: "corretor" });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {
      nome: form.nome, telefone: form.telefone || null,
      grupo_id: form.grupo_id || null, ativo: true, canal_notificacao: form.canal_notificacao,
      recebe_via_web: form.recebe_via_web, recebe_via_whatsapp: form.recebe_via_whatsapp,
    } }),
    onSuccess: () => { resetForm(); qc.invalidateQueries({ queryKey: ["corretores"] }); },
  });
  const inviteMut = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente e tente enviar o convite.");

      const response = await fetch("/api/corretores/convidar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: form.nome,
          email: form.email,
          telefone: form.telefone || null,
          grupo_id: form.grupo_id || null,
          canal_notificacao: form.canal_notificacao,
          recebe_via_web: form.recebe_via_web,
          recebe_via_whatsapp: form.recebe_via_whatsapp,
          role: form.role,
          redirect_to: `${window.location.origin}/set-password`,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result?.message ||
          result?.error ||
          "Não foi possível enviar o convite. Tente novamente.";
        throw new Error(typeof message === "string" ? message : "Não foi possível enviar o convite.");
      }
      return result;
    },
    onSuccess: () => { resetForm(); qc.invalidateQueries({ queryKey: ["corretores"] }); },
  });

  const flagMut = useMutation({
    mutationFn: (p: { id: string; patch: any }) => updateFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corretores"] }),
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Corretores</h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os corretores da equipe</p>
        </div>
        {isMaster && (
          <Button variant="outline" size="sm" onClick={() => setShowGrupos(true)}>
            <Layers className="mr-2 size-4" /> Gerenciar Grupos
          </Button>
        )}
      </div>

      <Card className="grid gap-2 p-4 md:grid-cols-6">
        <Input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Input placeholder="E-mail (para convite)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
        {isMaster ? (
          <Button
            disabled={!form.nome || !form.email || inviteMut.isPending}
            onClick={() => inviteMut.mutate(undefined, {
              onSuccess: () => toast.success("Convite enviado por e-mail!"),
              onError: (e: any) => {
                console.error("Erro ao enviar convite:", e);
                const msg =
                  e?.message ||
                  e?.data?.message ||
                  e?.error?.message ||
                  e?.error ||
                  "Falha ao enviar convite";
                toast.error(typeof msg === "string" ? msg : "Falha ao enviar convite");
              },
            })}
          >
            <Mail className="mr-2 size-4" /> {inviteMut.isPending ? "Enviando…" : "Enviar convite"}
          </Button>
        ) : (
          <Button onClick={() => form.nome && createMut.mutate()}><Plus className="mr-2 size-4" /> Adicionar</Button>
        )}

        <div className="flex flex-wrap items-center gap-4 md:col-span-6">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.recebe_via_web} onChange={(e) => setForm({ ...form, recebe_via_web: e.target.checked })} />
            Recebe via Web
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.recebe_via_whatsapp} onChange={(e) => setForm({ ...form, recebe_via_whatsapp: e.target.checked })} />
            Recebe via WhatsApp
          </label>
          {isMaster && (
            <span className="text-xs text-muted-foreground">
              O corretor receberá um e-mail com link para definir a senha e acessar o app.
            </span>
          )}
        </div>
      </Card>


      <div className="grid gap-2">
        {(data ?? []).map((c: any) => (
          <Card key={c.id} className="flex items-center justify-between p-4">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {c.nome}
                <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "ativo" : "inativo"}</Badge>
                {c.recebe_via_web && <Badge variant="outline" className="text-[10px]">Web</Badge>}
                {c.recebe_via_whatsapp && <Badge variant="outline" className="text-[10px]">WhatsApp</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.telefone ?? "—"} · {c.grupos?.nome ?? "Sem grupo"} · {c.canal_notificacao}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => flagMut.mutate({ id: c.id, patch: { ativo: !c.ativo } })}>
                {c.ativo ? "Parar de receber leads" : "Voltar a receber leads"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(c.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {showGrupos && isMaster && (
        <GruposModal onClose={() => setShowGrupos(false)} />
      )}
    </div>
  );
}

function GruposModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarGrupos);
  const createFn = useServerFn(criarGrupo);
  const delFn = useServerFn(excluirGrupo);
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => listFn() });
  const [nome, setNome] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { nome } }),
    onSuccess: () => { setNome(""); qc.invalidateQueries({ queryKey: ["grupos"] }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grupos"] }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Gerenciar Grupos</h2>
            <p className="text-xs text-muted-foreground">Organize corretores em equipes/imobiliárias</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <div className="mb-3 flex gap-2">
          <Input placeholder="Nome do novo grupo" value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nome) createMut.mutate(); }} />
          <Button onClick={() => nome && createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="mr-2 size-4" /> Novo Grupo
          </Button>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {(grupos ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado.</div>
          )}
          {(grupos ?? []).map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm font-medium">{g.nome}</span>
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(g.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
