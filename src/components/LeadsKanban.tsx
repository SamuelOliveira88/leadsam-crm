import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMoverEtapa } from "@/hooks/use-mover-etapa";
import { COR_ETAPA, ETAPAS_FUNIL, ehEtapaFunil, formatarReais, type EtapaFunil } from "@/lib/funil";
import { cn } from "@/lib/utils";

import { tr } from "@/i18n";
const POR_PAGINA = 50;

type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  fonte?: string | null;
  etapa_funil?: string | null;
  motivo_perda?: string | null;
  valor_negociacao?: number | null;
  visualizado_em?: string | null;
  corretor_id?: string | null;
  corretores?: { nome?: string | null } | null;
};

function etapaDe(l: Lead): EtapaFunil {
  return ehEtapaFunil(l.etapa_funil) ? l.etapa_funil : "Novo";
}

/** Só a aparência do cartão (usada também na sobreposição durante o arrasto). */
function CartaoVisual({ lead, className }: { lead: Lead; className?: string }) {
  const etapa = etapaDe(lead);
  return (
    <div className={cn("select-none rounded-lg border bg-card p-3 text-left shadow-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">{lead.nome}</div>
        {!lead.visualizado_em && lead.corretor_id && (
          <Badge variant="outline" className="shrink-0 border-orange-400 px-1.5 py-0 text-[10px] text-orange-600">{tr("novo")}</Badge>
        )}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{lead.telefone ?? "—"}</div>
      <div className="truncate text-xs text-muted-foreground">
        {lead.corretores?.nome ?? tr("não atribuído")}
        {lead.fonte ? ` · ${lead.fonte}` : ""}
      </div>
      {etapa === "Vendido" && lead.valor_negociacao != null && (
        <div className="mt-1 text-xs font-semibold text-emerald-600">{formatarReais(lead.valor_negociacao)}</div>
      )}
      {etapa === "Perdido" && lead.motivo_perda && (
        <div className="mt-1 line-clamp-2 text-xs text-rose-600">{lead.motivo_perda}</div>
      )}
    </div>
  );
}

function CartaoArrastavel({ lead, aoAbrir }: { lead: Lead; aoAbrir: (l: Lead) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => aoAbrir(lead)}>
      <CartaoVisual lead={lead} className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")} />
    </div>
  );
}

function Coluna({ etapa, leads, aoAbrir }: { etapa: EtapaFunil; leads: Lead[]; aoAbrir: (l: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const [limite, setLimite] = useState(POR_PAGINA);
  const totalVendido = useMemo(
    () => (etapa === "Vendido" ? leads.reduce((soma, l) => soma + (l.valor_negociacao ?? 0), 0) : 0),
    [etapa, leads],
  );
  const visiveis = leads.slice(0, limite);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("size-2.5 rounded-full", COR_ETAPA[etapa])} />
        <span className="flex-1 truncate text-sm font-semibold">{tr(etapa)}</span>
        <Badge variant="secondary">{leads.length}</Badge>
      </div>
      {etapa === "Vendido" && leads.length > 0 && (
        <div className="border-b px-3 py-1 text-xs font-medium text-emerald-600">{tr("Total: {formatarReais}", { formatarReais: formatarReais(totalVendido) })}</div>
      )}
      <div className="flex max-h-[calc(100vh-20rem)] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {visiveis.map((l) => (
          <CartaoArrastavel key={l.id} lead={l} aoAbrir={aoAbrir} />
        ))}
        {leads.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">{tr("Solte um lead aqui")}</div>}
        {leads.length > limite && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setLimite((n) => n + POR_PAGINA)}>{tr("Mostrar mais ({n})", { n: leads.length - limite })}
          </Button>
        )}
      </div>
    </div>
  );
}

export function LeadsKanban({ leads, aoAbrir }: { leads: Lead[]; aoAbrir: (l: Lead) => void }) {
  const { mover, dialogo } = useMoverEtapa();
  const [arrastando, setArrastando] = useState<Lead | null>(null);

  // Mouse: arrasta depois de mover 8px (clique continua abrindo o lead).
  // Toque: segura 250 ms para arrastar (rolar a tela continua funcionando).
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const porId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const porEtapa = useMemo(() => {
    const m = new Map<EtapaFunil, Lead[]>(ETAPAS_FUNIL.map((e) => [e, []]));
    for (const l of leads) m.get(etapaDe(l))!.push(l);
    return m;
  }, [leads]);

  function aoComecar(e: DragStartEvent) {
    setArrastando(porId.get(String(e.active.id)) ?? null);
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const lead = porId.get(String(e.active.id));
    const destino = e.over?.id;
    if (!lead || !ehEtapaFunil(destino)) return;
    mover(lead, destino);
  }

  return (
    <>
      <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
        <div className="flex items-start gap-3 overflow-x-auto pb-3">
          {ETAPAS_FUNIL.map((etapa) => (
            <Coluna key={etapa} etapa={etapa} leads={porEtapa.get(etapa) ?? []} aoAbrir={aoAbrir} />
          ))}
        </div>
        <DragOverlay>{arrastando ? <CartaoVisual lead={arrastando} className="rotate-1 shadow-lg" /> : null}</DragOverlay>
      </DndContext>
      {dialogo}
    </>
  );
}
