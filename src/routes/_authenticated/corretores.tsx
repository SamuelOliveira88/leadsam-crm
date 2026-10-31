import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Plus, Layers, X, Mail, UserCog, KeyRound, Copy } from "lucide-react";
import { listarCorretores, criarCorretor, atualizarCorretor, excluirCorretor, cadastrarCorretorComSenha, redefinirSenhaCorretor } from "@/lib/corretores.functions";
import { listarGrupos, criarGrupo, excluirGrupo } from "@/lib/grupos.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { lerListaBlindada, definirListaBlindada } from "@/lib/lista-blindada.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


import { RequireAdmin } from "@/components/RequireAdmin";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/corretores")({
  head: () => ({ meta: [{ title: tr("Corretores — Alexandria Leds") }] }),
  component: () => <RequireAdmin><Corretores /></RequireAdmin>,
});

function Corretores() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarCorretores);
  const gruposFn = useServerFn(listarGrupos);
  const createFn = useServerFn(criarCorretor);
  const updateFn = useServerFn(atualizarCorretor);
  const delFn = useServerFn(excluirCorretor);
  const cadastrarSenhaFn = useServerFn(cadastrarCorretorComSenha);
  const redefinirSenhaFn = useServerFn(redefinirSenhaCorretor);
  const perfilFn = useServerFn(meuPerfil);
  const { data } = useQuery({ queryKey: ["corretores"], queryFn: () => listFn() });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => gruposFn() });
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const isMaster = perfil?.role === "master";
  const lerBlindFn = useServerFn(lerListaBlindada);
  const defBlindFn = useServerFn(definirListaBlindada);
  const { data: blindInfo } = useQuery({ queryKey: ["listaBlindada"], queryFn: () => lerBlindFn() });
  const blindMut = useMutation({
    mutationFn: (blindada: boolean) => defBlindFn({ data: { blindada } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["listaBlindada"] });
      toast.success(r.blindada ? tr("Listas blindadas: corretor não vê o telefone.") : tr("Listas abertas: corretor vê o telefone."));
    },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não deu para mudar.")),
  });
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
      if (!token) throw new Error(tr("Sua sessão expirou. Entre novamente e tente enviar o convite."));

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
          tr("Não foi possível enviar o convite. Tente novamente.");
        throw new Error(typeof message === "string" ? message : tr("Não foi possível enviar o convite."));
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

  const [credenciais, setCredenciais] = useState<{ nome: string; email: string; senha: string } | null>(null);

  const cadastroSenhaMut = useMutation({
    mutationFn: () => cadastrarSenhaFn({ data: {
      nome: form.nome, email: form.email, telefone: form.telefone || null,
      grupo_id: form.grupo_id || null, canal_notificacao: form.canal_notificacao,
      recebe_via_web: form.recebe_via_web, recebe_via_whatsapp: form.recebe_via_whatsapp,
      role: form.role,
    } }),
    onSuccess: (r: any) => {
      setCredenciais({ nome: form.nome, email: r.email, senha: r.senha });
      resetForm();
      qc.invalidateQueries({ queryKey: ["corretores"] });
    },
    onError: (e: any) => toast.error(tr(e?.message) || tr("Falha ao cadastrar com senha")),
  });

  const redefinirSenhaMut = useMutation({
    mutationFn: (c: any) => redefinirSenhaFn({ data: { corretor_id: c.id } }),
    onSuccess: (r: any) => setCredenciais({ nome: r.nome, email: r.email ?? "", senha: r.senha }),
    onError: (e: any) => toast.error(tr(e?.message) || tr("Falha ao redefinir senha")),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tr("Corretores")}</h1>
          <p className="text-sm text-muted-foreground">{tr("Cadastre e gerencie os corretores da equipe")}</p>
        </div>
        {isMaster && (
          <Button variant="outline" size="sm" onClick={() => setShowGrupos(true)}>
            <Layers className="mr-2 size-4" /> {tr("Gerenciar Grupos")}</Button>
        )}
      </div>

      <Card className="grid gap-2 p-4 md:grid-cols-6">
        {isMaster && (
          <div className="flex flex-wrap gap-2 md:col-span-6">
            <Button
              type="button"
              size="sm"
              variant={form.role === "corretor" ? "default" : "outline"}
              onClick={() => setForm({ ...form, role: "corretor" })}
            >
              <Mail className="mr-2 size-4" /> {tr("Convidar Corretor")}</Button>
            <Button
              type="button"
              size="sm"
              variant={form.role === "gerente" ? "default" : "outline"}
              onClick={() => setForm({ ...form, role: "gerente" })}
            >
              <UserCog className="mr-2 size-4" /> {tr("Convidar Gerente")}</Button>
          </div>
        )}
        <Input placeholder={tr("Nome")} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Input placeholder={tr("E-mail (para convite)")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder={tr("WhatsApp (55...)")} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} disabled={isMaster && form.role === "gerente"} />
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.grupo_id} onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}>
          <option value="">{form.role === "gerente" ? tr("Selecione o grupo…") : tr("Sem grupo")}</option>
          {(grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.canal_notificacao} onChange={(e) => setForm({ ...form, canal_notificacao: e.target.value as any })} disabled={isMaster && form.role === "gerente"}>
          <option value="whatsapp">{tr("WhatsApp")}</option>
          <option value="email">{tr("E-mail")}</option>
          <option value="ambos">{tr("Ambos")}</option>
          <option value="nenhum">{tr("Nenhum")}</option>
        </select>
        {isMaster ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!form.nome || !form.email || (form.role === "gerente" && !form.grupo_id) || inviteMut.isPending}
              onClick={() => inviteMut.mutate(undefined, {
                onSuccess: () => toast.success(form.role === "gerente" ? tr("Convite de gerente enviado!") : tr("Convite enviado por e-mail!")),
                onError: (e: any) => {
                  const msg = e?.message || e?.data?.message || e?.error?.message || e?.error || tr("Falha ao enviar convite");
                  toast.error(typeof msg === "string" ? tr(msg) : tr("Falha ao enviar convite"));
                },
              })}
            >
              <Mail className="mr-2 size-4" /> {inviteMut.isPending ? tr("Enviando…") : tr("Enviar convite por e-mail")}
            </Button>
            <Button
              variant="secondary"
              disabled={!form.nome || !form.email || (form.role === "gerente" && !form.grupo_id) || cadastroSenhaMut.isPending}
              onClick={() => cadastroSenhaMut.mutate()}
            >
              <KeyRound className="mr-2 size-4" /> {cadastroSenhaMut.isPending ? tr("Criando…") : tr("Cadastrar com senha (sem e-mail)")}
            </Button>
          </div>
        ) : (
          <Button onClick={() => form.nome && createMut.mutate()}><Plus className="mr-2 size-4" /> {tr("Adicionar")}</Button>
        )}

        <div className="flex flex-wrap items-center gap-4 md:col-span-6">
          {form.role === "corretor" && (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.recebe_via_whatsapp} onChange={(e) => setForm({ ...form, recebe_via_whatsapp: e.target.checked })} />{tr("Recebe leads direto (rodízio e aviso no WhatsApp)")}</label>
              <span className="text-xs text-muted-foreground">{tr("Desmarcado: só vê na tela os leads que forem passados para ele.")}</span>
            </>
          )}
          {isMaster && (
            <span className="text-xs text-muted-foreground">
              {form.role === "gerente"
                ? tr("O gerente receberá um e-mail com link para definir a senha e verá todos os leads e corretores do grupo selecionado.")
                : tr("O corretor receberá um e-mail com link para definir a senha e acessar o app.")}
            </span>
          )}
        </div>
      </Card>



      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="font-medium">{tr("Telefone dos leads de lista (planilha)")}</div>
          <div className="text-sm text-muted-foreground">
            {blindInfo?.blindada !== false
              ? tr("Blindado: o corretor vê só o nome e conversa pela tela Conversas.")
              : tr("Aberto: o corretor vê o telefone dos leads de lista.")} {tr("Leads do número mãe ficam sempre blindados.")}</div>
        </div>
        {isMaster && (
          <Button
            variant="outline"
            disabled={blindMut.isPending || !blindInfo}
            onClick={() => blindMut.mutate(blindInfo?.blindada === false)}
          >
            {blindInfo?.blindada === false ? tr("Blindar") : tr("Abrir")}
          </Button>
        )}
      </Card>

      <div className="grid gap-2">
        {(data ?? []).map((c: any) => (
          <Card key={c.id} className="flex items-center justify-between p-4">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {c.nome}
                {c.ultimo_ping && Date.now() - new Date(c.ultimo_ping).getTime() < 3 * 60_000 ? (
                  <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">{tr("● online")}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{tr("○ offline")}</Badge>
                )}
                <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? tr("ativo") : tr("inativo")}</Badge>
                {c.recebe_via_web && <Badge variant="outline" className="text-[10px]">{tr("Web")}</Badge>}
                {c.recebe_via_whatsapp && <Badge variant="outline" className="text-[10px]">{tr("WhatsApp")}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.telefone ?? "—"} · {c.grupos?.nome ?? tr("Sem grupo")} · {c.canal_notificacao}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => flagMut.mutate({ id: c.id, patch: { ativo: !c.ativo } })}>
                {c.ativo ? tr("Parar de receber leads") : tr("Voltar a receber leads")}
              </Button>
              {isMaster && (
                <Button size="sm" variant="outline" disabled={redefinirSenhaMut.isPending} onClick={() => redefinirSenhaMut.mutate(c)}>
                  <KeyRound className="mr-2 size-4" /> {tr("Definir senha")}</Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(c.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {credenciais && (
        <CredenciaisModal creds={credenciais} onClose={() => setCredenciais(null)} />
      )}

      {showGrupos && isMaster && (
        <GruposModal onClose={() => setShowGrupos(false)} />
      )}
    </div>
  );
}

function CredenciaisModal({ creds, onClose }: { creds: { nome: string; email: string; senha: string }; onClose: () => void }) {
  const copiar = async () => {
    const txt = tr("Acesso Alexandria Leds\nSite: https://alexandria-leds.lovable.app/auth\nE-mail: {email}\nSenha: {senha}", { email: creds.email, senha: creds.senha });
    try { await navigator.clipboard.writeText(txt); toast.success(tr("Copiado! Cole no WhatsApp.")); }
    catch { toast.error(tr("Não foi possível copiar")); }
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(
    tr("Olá {nome}, aqui está seu acesso ao Alexandria Leds:\n\n🔗 https://alexandria-leds.lovable.app/auth\n📧 {email}\n🔑 {senha}\n\nAo entrar, você pode trocar a senha em \"Perfil\".", { nome: creds.nome, email: creds.email, senha: creds.senha })
  )}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{tr("Credenciais de {nome}", { nome: creds.nome })}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{tr("Copie e envie por WhatsApp. A senha só aparece agora — depois é preciso redefinir.")}</p>
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
          <div><span className="text-muted-foreground">{tr("E-mail:")}</span> {creds.email}</div>
          <div><span className="text-muted-foreground">{tr("Senha:")}</span> <strong>{creds.senha}</strong></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={copiar}><Copy className="mr-2 size-4" /> {tr("Copiar tudo")}</Button>
          <a href={wa} target="_blank" rel="noreferrer">
            <Button variant="secondary">{tr("Abrir WhatsApp")}</Button>
          </a>
          <Button variant="ghost" onClick={onClose}>{tr("Fechar")}</Button>
        </div>
      </Card>
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
            <h2 className="text-lg font-semibold">{tr("Gerenciar Grupos")}</h2>
            <p className="text-xs text-muted-foreground">{tr("Organize corretores em equipes/imobiliárias")}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <div className="mb-3 flex gap-2">
          <Input placeholder={tr("Nome do novo grupo")} value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nome) createMut.mutate(); }} />
          <Button onClick={() => nome && createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="mr-2 size-4" /> {tr("Novo Grupo")}</Button>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {(grupos ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">{tr("Nenhum grupo cadastrado.")}</div>
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
