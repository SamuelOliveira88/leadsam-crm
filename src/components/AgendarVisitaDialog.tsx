import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { agendarCompromisso, opcoesAgenda } from "@/lib/agenda.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import {
  ROTULO_TIPO,
  TIPOS_COMPROMISSO,
  horaSP,
  hojeSP,
  inputLocalParaISO,
  isoParaInputLocal,
  rotuloDia,
  diaSP,
  somarDias,
  type TipoCompromisso,
} from "@/lib/agenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LeadParaAgendar = { id: string; nome?: string | null; corretor_id?: string | null };

/** Agenda uma visita (ou ligação/reunião) para um lead. Visita move o lead para "Visita agendada". */
export function AgendarVisitaDialog({
  lead,
  aberto,
  aoFechar,
  aoAgendar,
}: {
  lead: LeadParaAgendar;
  aberto: boolean;
  aoFechar: () => void;
  aoAgendar?: (tipo: TipoCompromisso) => void;
}) {
  const qc = useQueryClient();
  const agendarFn = useServerFn(agendarCompromisso);
  const opcoesFn = useServerFn(opcoesAgenda);
  const perfilFn = useServerFn(meuPerfil);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const { data: opcoes } = useQuery({ queryKey: ["opcoes_agenda"], queryFn: () => opcoesFn(), enabled: aberto });

  const [tipo, setTipo] = useState<TipoCompromisso>("visita");
  const [quando, setQuando] = useState("");
  const [empreendimento, setEmpreendimento] = useState("");
  const [corretorId, setCorretorId] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Cada vez que abre, começa limpo: amanhã às 10h, corretor do lead.
  useEffect(() => {
    if (!aberto) return;
    setTipo("visita");
    setQuando(`${somarDias(hojeSP(), 1)}T10:00`);
    setEmpreendimento("");
    setCorretorId(lead.corretor_id ?? "");
    setObs("");
    setErro(null);
  }, [aberto, lead.id, lead.corretor_id]);

  const ehCorretor = perfil?.role === "corretor";

  const agendar = useMutation({
    mutationFn: (v: { iso: string }) =>
      agendarFn({
        data: {
          lead_id: lead.id,
          tipo,
          data_hora: v.iso,
          empreendimento: empreendimento.trim() || null,
          corretor_id: corretorId || null,
          observacoes: obs.trim() || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`${ROTULO_TIPO[tipo]} agendada para ${rotuloDia(diaSP(r.data_hora))} às ${horaSP(r.data_hora)}.`);
      qc.invalidateQueries({ queryKey: ["compromissos"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      aoAgendar?.(tipo);
      aoFechar();
    },
    onError: (e: any) => setErro(e?.message ?? "Não foi possível agendar."),
  });

  function confirmar() {
    const iso = inputLocalParaISO(quando);
    if (!iso) return setErro("Escolha a data e a hora.");
    if (new Date(iso).getTime() < Date.now() - 5 * 60_000) return setErro("Escolha uma data e hora no futuro.");
    if (!ehCorretor && !corretorId) return setErro("Escolha o corretor responsável.");
    setErro(null);
    agendar.mutate({ iso });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar {ROTULO_TIPO[tipo].toLowerCase()}</DialogTitle>
          <DialogDescription>{lead.nome ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="ag-tipo">Tipo</Label>
            <select id="ag-tipo" className="w-full rounded-md border bg-background p-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCompromisso)}>
              {TIPOS_COMPROMISSO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="ag-quando">Data e hora</Label>
            <Input id="ag-quando" type="datetime-local" value={quando} min={isoParaInputLocal(new Date().toISOString())} onChange={(e) => { setQuando(e.target.value); setErro(null); }} />
          </div>
          <div>
            <Label htmlFor="ag-empr">Empreendimento</Label>
            <Input id="ag-empr" list="ag-empr-lista" value={empreendimento} maxLength={120} onChange={(e) => setEmpreendimento(e.target.value)} placeholder="Ex.: Vista Plaza" />
            <datalist id="ag-empr-lista">
              {(opcoes?.empreendimentos ?? []).map((e) => <option key={e.id} value={e.nome} />)}
            </datalist>
          </div>
          {!ehCorretor && (
            <div>
              <Label htmlFor="ag-corretor">Corretor responsável</Label>
              <select id="ag-corretor" className="w-full rounded-md border bg-background p-2 text-sm" value={corretorId} onChange={(e) => { setCorretorId(e.target.value); setErro(null); }}>
                <option value="">Escolha…</option>
                {(opcoes?.corretores ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="ag-obs">Observações</Label>
            <Textarea id="ag-obs" rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: levar planta e simulação" />
          </div>
          <p className="text-xs text-muted-foreground">O corretor recebe um lembrete no WhatsApp 1 hora antes.</p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={confirmar} disabled={agendar.isPending}>{agendar.isPending ? "Agendando…" : "Agendar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
