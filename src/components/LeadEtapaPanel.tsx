import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMoverEtapa, type EtapaMovida } from "@/hooks/use-mover-etapa";
import { listarHistoricoLead } from "@/lib/funil.functions";
import { ETAPAS_FUNIL, ehEtapaFunil, formatarReais, type EtapaFunil } from "@/lib/funil";

type LeadEtapa = {
  id: string;
  nome?: string | null;
  etapa_funil?: string | null;
  motivo_perda?: string | null;
  valor_negociacao?: number | null;
};

/** Etapa do funil dentro do lead: seletor para mudar e histórico das mudanças. */
export function LeadEtapaPanel({ lead }: { lead: LeadEtapa }) {
  const historicoFn = useServerFn(listarHistoricoLead);
  const [atual, setAtual] = useState({
    etapa: (ehEtapaFunil(lead.etapa_funil) ? lead.etapa_funil : "Novo") as EtapaFunil,
    motivo: lead.motivo_perda ?? null,
    valor: lead.valor_negociacao ?? null,
  });

  const { mover, dialogo } = useMoverEtapa({
    aoMover: (linha: EtapaMovida) => {
      if (linha.id !== lead.id) return;
      setAtual({
        etapa: (ehEtapaFunil(linha.etapa_funil) ? linha.etapa_funil : "Novo") as EtapaFunil,
        motivo: linha.motivo_perda,
        valor: linha.valor_negociacao,
      });
    },
  });

  const { data: historico } = useQuery({
    queryKey: ["lead_historico", lead.id],
    queryFn: () => historicoFn({ data: { lead_id: lead.id } }),
  });

  const quando = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mb-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="etapa-lead" className="text-xs font-semibold uppercase text-muted-foreground">Etapa do funil</label>
        <select
          id="etapa-lead"
          className="rounded-md border bg-background p-2 text-sm"
          value={atual.etapa}
          onChange={(e) =>
            mover(
              { id: lead.id, nome: lead.nome, etapa_funil: atual.etapa, motivo_perda: atual.motivo, valor_negociacao: atual.valor },
              e.target.value as EtapaFunil,
            )
          }
        >
          {ETAPAS_FUNIL.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {atual.etapa === "Perdido" && atual.motivo && (
        <div className="mt-2 text-sm text-rose-600">Motivo da perda: {atual.motivo}</div>
      )}
      {atual.etapa === "Vendido" && atual.valor != null && (
        <div className="mt-2 text-sm font-semibold text-emerald-600">Valor da venda: {formatarReais(atual.valor)}</div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          Histórico de etapas ({historico?.length ?? 0})
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {(historico ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span>{quando(h.created_at)}</span>
              <span>·</span>
              <span>{h.usuario_nome ?? "Sistema"}</span>
              <span>·</span>
              <span className="text-foreground">{h.etapa_anterior ?? "—"} → {h.etapa_nova}</span>
            </li>
          ))}
          {(historico?.length ?? 0) === 0 && <li className="text-muted-foreground">Nenhuma mudança registrada.</li>}
        </ul>
      </details>

      {dialogo}
    </div>
  );
}
