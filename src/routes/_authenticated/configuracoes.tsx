import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Check, ShieldAlert, ExternalLink } from "lucide-react";
import { listarConsultores } from "@/lib/consultores.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ADMIN_EMAIL = "samuelrodrigodeoliveira@gmail.com";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ImobLead" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const { user } = Route.useRouteContext();
  const isAdmin = (user.email ?? "").toLowerCase() === ADMIN_EMAIL;
  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-10 text-destructive" />
        <h2 className="text-lg font-semibold">Acesso negado</h2>
      </Card>
    );
  }
  return <AdminConfig />;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button size="sm" variant="outline" onClick={() => {
      navigator.clipboard.writeText(text); setCopied(true); toast.success("Copiado");
      setTimeout(() => setCopied(false), 1500);
    }}>
      {copied ? <Check className="mr-2 size-4 text-success" /> : <Copy className="mr-2 size-4" />}
      Copiar
    </Button>
  );
}

function AdminConfig() {
  const listar = useServerFn(listarConsultores);
  const consultores = useQuery({ queryKey: ["consultores"], queryFn: () => listar() });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Configurações</h1>
        <p className="text-sm text-muted-foreground">Integrações e endpoints públicos.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Webhook Facebook Lead Ads (por consultor)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Copie a URL do consultor e cole no Zapier/Make. Os leads serão criados automaticamente atribuídos a ele.</p>
        <div className="mt-4 space-y-2">
          {(consultores.data ?? []).map((c) => {
            const url = `${origin}/api/public/webhook/facebook?broker=${encodeURIComponent(c.nome)}`;
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <Badge variant="outline">{c.nome}</Badge>
                <code className="flex-1 truncate text-xs">{url}</code>
                <CopyBtn text={url} />
              </div>
            );
          })}
          {(consultores.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Cadastre consultores primeiro.</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-base font-semibold">Como conectar via Zapier <span className="text-xs font-normal text-muted-foreground">(plano gratuito disponível)</span></h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Crie um novo Zap.</li>
            <li>Trigger: <strong>Facebook Lead Ads → New Lead</strong>. Conecte sua página e formulário.</li>
            <li>Action: <strong>Webhooks by Zapier → POST</strong>.</li>
            <li>URL: cole a URL do consultor acima.</li>
            <li>Payload Type: <strong>JSON</strong>. Data: <code className="text-xs">{`{ "name": "{{Full Name}}", "phone": "{{Phone Number}}", "interest": "{{Custom Question}}" }`}</code></li>
            <li>Teste e ative.</li>
          </ol>
          <a href="https://zapier.com" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Abrir Zapier <ExternalLink className="size-3" /></a>
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold">Como conectar via Make.com <span className="text-xs font-normal text-muted-foreground">(plano gratuito disponível)</span></h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Novo cenário no Make.com.</li>
            <li>Módulo: <strong>Facebook Lead Ads → Watch Leads</strong>.</li>
            <li>Módulo: <strong>HTTP → Make a request</strong>.</li>
            <li>Method: <strong>POST</strong>. URL: cole a URL do consultor.</li>
            <li>Body type: <strong>Raw / JSON</strong>. Content: <code className="text-xs">{`{ "name": "{{name}}", "phone": "{{phone}}" }`}</code></li>
            <li>Salve e execute.</li>
          </ol>
          <a href="https://make.com" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Abrir Make.com <ExternalLink className="size-3" /></a>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Endpoint público n8n — WhatsApp Bot</h2>
        <p className="mt-1 text-sm text-muted-foreground">Envie leads do seu bot WhatsApp para distribuição automática (rodízio) entre os consultores ativos.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <code className="flex-1 truncate text-xs">POST {origin}/api/public/n8n-lead</code>
          <CopyBtn text={`${origin}/api/public/n8n-lead`} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">Exemplo de payload</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/95 p-3 text-xs text-background">{`{
  "numero": "5511999998888",
  "resposta": "Interessado em apto 2 quartos zona sul"
}`}</pre>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">Exemplo de resposta</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/95 p-3 text-xs text-background">{`{
  "consultor_nome": "Maria Silva",
  "consultor_numero": "5511988887777"
}`}</pre>
          </div>
        </div>
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p><strong>400</strong>: campos <code>numero</code> ou <code>resposta</code> ausentes/ inválidos.</p>
          <p><strong>503</strong>: nenhum consultor ativo cadastrado.</p>
        </div>
      </Card>
    </div>
  );
}
