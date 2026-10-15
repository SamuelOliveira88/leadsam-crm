import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { moverEtapaLead } from "@/lib/funil.functions";
import { MOTIVOS_PERDA_SUGERIDOS, formatarReais, parseValorBR, type EtapaFunil } from "@/lib/funil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LeadParaMover = {
  id: string;
  nome?: string | null;
  etapa_funil?: string | null;
  motivo_perda?: string | null;
  valor_negociacao?: number | null;
};

export type EtapaMovida = {
  id: string;
  etapa_funil: string;
  motivo_perda: string | null;
  valor_negociacao: number | null;
};

type Pedido = { lead: LeadParaMover; etapa: "Perdido" | "Vendido" };

/**
 * Muda a etapa de um lead. Pede o motivo ao mover para Perdido e o valor ao mover para Vendido.
 * Atualiza a lista de leads na hora (otimista) e desfaz se o servidor recusar.
 * Devolve `mover` e o `dialogo`, que precisa ser renderizado em algum lugar da tela.
 */
export function useMoverEtapa(opcoes?: { aoMover?: (linha: EtapaMovida) => void }) {
  const qc = useQueryClient();
  const moverFn = useServerFn(moverEtapaLead);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const mutacao = useMutation({
    mutationFn: (v: { lead_id: string; etapa: EtapaFunil; motivo_perda?: string; valor_negociacao?: number }) =>
      moverFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const anterior = qc.getQueryData<any[]>(["leads"]);
      qc.setQueryData<any[]>(["leads"], (lista) =>
        (lista ?? []).map((l) =>
          l.id === v.lead_id
            ? {
                ...l,
                etapa_funil: v.etapa,
                ...(v.etapa === "Perdido" ? { motivo_perda: v.motivo_perda } : {}),
                ...(v.etapa === "Vendido" ? { valor_negociacao: v.valor_negociacao } : {}),
              }
            : l,
        ),
      );
      return { anterior };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(["leads"], ctx.anterior);
      toast.error(e?.message ?? "Não foi possível mover o lead");
    },
    onSuccess: (linha: any, v) => {
      toast.success(`Lead movido para ${v.etapa}`);
      qc.invalidateQueries({ queryKey: ["lead_historico", v.lead_id] });
      opcoes?.aoMover?.(linha as EtapaMovida);
    },
  });

  function mover(lead: LeadParaMover, etapa: EtapaFunil) {
    if ((lead.etapa_funil ?? "Novo") === etapa) return;
    if (etapa === "Perdido") {
      setMotivo(lead.motivo_perda ?? "");
      setErro(null);
      setPedido({ lead, etapa });
      return;
    }
    if (etapa === "Vendido") {
      setValor(lead.valor_negociacao ? String(lead.valor_negociacao).replace(".", ",") : "");
      setErro(null);
      setPedido({ lead, etapa });
      return;
    }
    mutacao.mutate({ lead_id: lead.id, etapa });
  }

  function confirmar() {
    if (!pedido) return;
    if (pedido.etapa === "Perdido") {
      const m = motivo.trim();
      if (m.length < 3) return setErro("Escreva o motivo (pelo menos 3 letras).");
      mutacao.mutate({ lead_id: pedido.lead.id, etapa: "Perdido", motivo_perda: m });
    } else {
      const v = parseValorBR(valor);
      if (v === null) return setErro("Digite um valor maior que zero. Ex.: 250000 ou 250.000,00");
      mutacao.mutate({ lead_id: pedido.lead.id, etapa: "Vendido", valor_negociacao: v });
    }
    setPedido(null);
  }

  const valorLido = parseValorBR(valor);

  const dialogo = (
    <Dialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto) setPedido(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pedido?.etapa === "Perdido" ? "Por que o lead foi perdido?" : "Qual foi o valor da venda?"}</DialogTitle>
          <DialogDescription>{pedido?.lead.nome ?? ""}</DialogDescription>
        </DialogHeader>

        {pedido?.etapa === "Perdido" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_PERDA_SUGERIDOS.map((m) => (
                <Button key={m} type="button" size="sm" variant="outline" onClick={() => { setMotivo(m); setErro(null); }}>
                  {m}
                </Button>
              ))}
            </div>
            <div>
              <Label htmlFor="motivo-perda">Motivo</Label>
              <Textarea
                id="motivo-perda"
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
                placeholder="Escreva o motivo"
              />
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="valor-venda">Valor da venda (R$)</Label>
            <Input
              id="valor-venda"
              inputMode="decimal"
              value={valor}
              onChange={(e) => { setValor(e.target.value); setErro(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
              placeholder="Ex.: 250.000,00"
              autoFocus
            />
            {valorLido !== null && <p className="mt-1 text-xs text-muted-foreground">Entendi: {formatarReais(valorLido)}</p>}
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setPedido(null)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={mutacao.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { mover, dialogo, movendo: mutacao.isPending };
}
