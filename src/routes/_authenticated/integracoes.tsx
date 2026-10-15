import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { meuPerfil } from "@/lib/perfis.functions";
import { criarToken, definirTokenAtivo, listarTokens } from "@/lib/webhook-tokens.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Alexandria Leds" }] }),
  component: IntegracoesPage,
});

type TokenLinha = { id: string; nome: string; ativo: boolean; created_at: string };

function IntegracoesPage() {
  const perfilFn = useServerFn(meuPerfil);
  const { data: perfil, isLoading } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });

  if (isLoading || !perfil) return null;

  if (!(perfil.role === "master" || perfil.super_admin)) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="mb-2 text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">Esta área é exclusiva para o master da empresa.</p>
          <Link to="/dashboard">
            <Button className="mt-6">Voltar ao Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return <Tokens />;
}

function Tokens() {
  const qc = useQueryClient();
  const listFn = useServerFn(listarTokens);
  const criarFn = useServerFn(criarToken);
  const ativoFn = useServerFn(definirTokenAtivo);

  const { data: tokens, isLoading } = useQuery({ queryKey: ["webhook_tokens"], queryFn: () => listFn() });

  const [nome, setNome] = useState("");
  // O token em texto puro só existe aqui, em memória, logo após a criação.
  const [novoToken, setNovoToken] = useState<{ nome: string; token: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [desativar, setDesativar] = useState<TokenLinha | null>(null);

  const criar = useMutation({
    mutationFn: () => criarFn({ data: { nome } }),
    onSuccess: (r) => {
      setNovoToken({ nome: r.nome, token: r.token });
      setCopiado(false);
      setNome("");
      qc.invalidateQueries({ queryKey: ["webhook_tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível criar o token"),
  });

  const alterarAtivo = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => ativoFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.ativo ? "Token reativado" : "Token desativado");
      qc.invalidateQueries({ queryKey: ["webhook_tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível alterar o token"),
  });

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      toast.error("Não consegui copiar. Selecione o token e copie manualmente.");
    }
  }

  const urlWebhook = typeof window !== "undefined" ? `${window.location.origin}/api/public/webhook` : "/api/public/webhook";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tokens para enviar leads de formulários, landing pages e anúncios direto para a sua empresa.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> Gerar novo token</div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (nome.trim().length >= 2) criar.mutate(); }}
        >
          <div className="flex-1">
            <Label htmlFor="nome-token">Nome (para você saber de onde vem)</Label>
            <Input id="nome-token" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Landing page Vista Plaza" />
          </div>
          <Button type="submit" disabled={criar.isPending || nome.trim().length < 2}>
            {criar.isPending ? "Gerando…" : "Gerar token"}
          </Button>
        </form>
      </Card>

      {novoToken && (
        <Card className="space-y-3 border-primary/40 bg-primary/5 p-5">
          <div className="text-sm font-semibold">Token “{novoToken.nome}” criado</div>
          <p className="text-sm text-destructive">
            Copie agora. Por segurança, ele <strong>não será mostrado de novo</strong>.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-md border bg-background px-3 py-2 text-xs">{novoToken.token}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copiar(novoToken.token)}>
              {copiado ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Envie um <strong>POST</strong> para <code>{urlWebhook}</code></div>
            <div>Cabeçalho: <code>x-webhook-token: (o token acima)</code></div>
            <div>Corpo (JSON): <code>{"{ \"nome\": \"...\", \"telefone\": \"...\", \"grupo_id\": \"...\" }"}</code></div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNovoToken(null)}>Já copiei, fechar</Button>
        </Card>
      )}

      <Card className="p-0">
        <div className="border-b px-5 py-3 text-sm font-semibold">Tokens da empresa</div>
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">Carregando…</div>
        ) : (tokens?.length ?? 0) === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">Nenhum token criado ainda.</div>
        ) : (
          <ul className="divide-y">
            {(tokens as TokenLinha[]).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    Criado em {new Date(t.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </div>
                </div>
                <Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Desativado"}</Badge>
                {t.ativo ? (
                  <Button type="button" variant="outline" size="sm" disabled={alterarAtivo.isPending} onClick={() => setDesativar(t)}>
                    Desativar
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={alterarAtivo.isPending} onClick={() => alterarAtivo.mutate({ id: t.id, ativo: true })}>
                    Reativar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AlertDialog open={!!desativar} onOpenChange={(o) => { if (!o) setDesativar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar “{desativar?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem usa este token vai parar de enviar leads na hora. Você pode reativar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (desativar) alterarAtivo.mutate({ id: desativar.id, ativo: false }); setDesativar(null); }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
