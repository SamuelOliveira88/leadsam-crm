import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequireAdmin } from "@/components/RequireAdmin";
import { criarPagamento } from "@/lib/planos.functions";

export const Route = createFileRoute("/_authenticated/meu-plano")({
  head: () => ({ meta: [{ title: "Meu plano — Alexandria Leds" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ pago: s.pago === "1" || s.pago === 1 ? 1 : 0 }),
  component: () => <RequireAdmin><MeuPlano /></RequireAdmin>,
});

type Plano = { efetivo: "teste" | "gratis" | "alexandria"; plano: string; plano_ate: string | null; teste_ate: string | null };

const NOMES: Record<string, string> = { teste: "Teste (tudo liberado)", gratis: "Sem plano ativo", alexandria: "Alexandria Leads" };
const dia = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

const ITENS = ["Até 10 corretores incluídos", "Distribuição de leads em rodízio", "Conversas pelo WhatsApp da imobiliária", "Funil, planilha, agenda, espelho e propostas", "Importação de leads e integrações"];

function MeuPlano() {
  const { pago } = Route.useSearch();
  const payFn = useServerFn(criarPagamento);
  const { data, isLoading } = useQuery({
    queryKey: ["meu-plano"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("meu_plano");
      if (error) throw new Error(error.message);
      return data as Plano | null;
    },
    refetchInterval: pago ? 4000 : false, // logo depois de pagar, espera o aviso do Asaas chegar
  });
  const assinar = useMutation({
    mutationFn: (plano: "alexandria") => payFn({ data: { plano } }),
    onSuccess: ({ url }) => { window.open(url, "_blank", "noopener"); },
    onError: (e: any) => toast.error(e?.message || "Não consegui abrir o pagamento."),
  });

  const atual = data?.efetivo;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><CreditCard className="size-6" /> Meu plano</h1>
        <p className="text-sm text-muted-foreground">Pague por Pix, boleto ou cartão. O plano é liberado sozinho assim que o pagamento é confirmado.</p>
      </div>

      {pago ? (
        <Card className="border-primary/40 bg-primary/5 p-4 text-sm">
          Obrigado! Estamos confirmando o seu pagamento. Pix e cartão aparecem em poucos instantes; boleto leva até 1 dia útil.
        </Card>
      ) : null}

      <Card className="p-4">
        {isLoading ? "Carregando…" : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Plano atual:</span>
            <Badge>{NOMES[atual ?? "gratis"]}</Badge>
            {atual === "teste" && data?.teste_ate && <span className="text-muted-foreground">até {dia(data.teste_ate)}</span>}
            {atual === "alexandria" && data?.plano_ate && <span className="text-muted-foreground">válido até {dia(data.plano_ate)}</span>}
          </div>
        )}
      </Card>

      <Card className="flex max-w-md flex-col gap-3 border-primary/50 p-5">
        <div className="text-lg font-semibold">Alexandria Leads</div>
        <div><span className="text-3xl font-bold">R$ 299</span> <span className="text-xs text-muted-foreground">por mês, por imobiliária</span></div>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          {ITENS.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{i}</li>)}
        </ul>
        <Button onClick={() => assinar.mutate("alexandria")} disabled={assinar.isPending || atual === "alexandria"}>
          {atual === "alexandria" ? "Seu plano" : assinar.isPending ? "Abrindo…" : "Assinar"}
        </Button>
      </Card>
      <p className="text-xs text-muted-foreground">Pagamento processado pelo Asaas. Sem fidelidade. Dúvidas? Fale com a Mi.IA no WhatsApp.</p>
    </div>
  );
}
