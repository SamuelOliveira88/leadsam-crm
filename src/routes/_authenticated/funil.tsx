import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { listarLeads, moverEstagio } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { ESTAGIOS_ORDEM, ESTAGIO_LABELS, formatBRL, type Estagio } from "@/lib/formatters";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/funil")({
  head: () => ({ meta: [{ title: "Funil — ImobLead" }] }),
  component: FunilPage,
});

type Lead = { id: string; nome: string; telefone: string; estagio: Estagio; valor_estimado: number | null; origem: string };

function FunilPage() {
  const listar = useServerFn(listarLeads);
  const mover = useServerFn(moverEstagio);
  const qc = useQueryClient();
  const leads = useQuery({ queryKey: ["leads"], queryFn: () => listar() });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const moverMut = useMutation({
    mutationFn: (v: { id: string; estagio: Estagio }) => mover({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], (old) => (old ?? []).map((l) => l.id === v.id ? { ...l, estagio: v.estagio } : l));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["leads"], ctx.prev); toast.error("Não foi possível mover"); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const grouped = useMemo(() => {
    const arr = (leads.data ?? []) as Lead[];
    return ESTAGIOS_ORDEM.reduce<Record<Estagio, Lead[]>>((acc, e) => {
      acc[e] = arr.filter((l) => l.estagio === e);
      return acc;
    }, { novo: [], em_contato: [], proposta: [], fechado: [], perdido: [] });
  }, [leads.data]);

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const to = e.over?.id as Estagio | undefined;
    if (!to) return;
    const lead = (leads.data as Lead[] | undefined)?.find((l) => l.id === id);
    if (!lead || lead.estagio === to) return;
    moverMut.mutate({ id, estagio: to });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Funil de vendas</h1>
        <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas para atualizar o estágio.</p>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 lg:snap-none">
          {ESTAGIOS_ORDEM.map((e) => (
            <Column key={e} estagio={e} leads={grouped[e]} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ estagio, leads }: { estagio: Estagio; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: estagio });
  const total = leads.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0);
  return (
    <div ref={setNodeRef} className={`w-72 shrink-0 snap-start rounded-xl border border-border bg-muted/40 p-3 transition ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <div className="text-sm font-semibold">{ESTAGIO_LABELS[estagio]}</div>
          <div className="text-[11px] text-muted-foreground">{leads.length} • {formatBRL(total)}</div>
        </div>
      </div>
      <div className="space-y-2 min-h-[100px]">
        {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
        {leads.length === 0 && <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Solte um card aqui</div>}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <Card ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`cursor-grab touch-none p-3 shadow-soft transition ${isDragging ? "opacity-60 cursor-grabbing" : ""}`}>
      <div className="truncate text-sm font-medium">{lead.nome}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{lead.telefone}</div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{lead.origem}</span>
        {lead.valor_estimado ? <span className="font-medium text-success">{formatBRL(lead.valor_estimado)}</span> : null}
      </div>
    </Card>
  );
}
