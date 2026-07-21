import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Lock, Unlock, Loader2 } from "lucide-react";
import {
  listarEmpreendimentos,
  listarUnidades,
  criarUnidadesLote,
  reservarUnidade,
  liberarUnidade,
  atualizarUnidade,
} from "@/lib/espelho.functions";
import { listarLeads } from "@/lib/leads.functions";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/espelho")({
  ssr: false,
  component: Espelho,
});

const CORES: Record<string, string> = {
  disponivel: "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/25",
  reservada: "bg-amber-500/15 border-amber-500/50 text-amber-700 hover:bg-amber-500/25",
  vendida: "bg-rose-500/15 border-rose-500/50 text-rose-700",
  bloqueada: "bg-muted border-border text-muted-foreground",
};

const LABEL_STATUS: Record<string, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  vendida: "Vendida",
  bloqueada: "Bloqueada",
};

function Espelho() {
  const qc = useQueryClient();
  const fetchPerfil = useServerFn(meuPerfil);
  const fetchEmpreendimentos = useServerFn(listarEmpreendimentos);
  const fetchUnidades = useServerFn(listarUnidades);
  const fetchLeads = useServerFn(listarLeads);
  const criarLoteFn = useServerFn(criarUnidadesLote);
  const reservarFn = useServerFn(reservarUnidade);
  const liberarFn = useServerFn(liberarUnidade);
  const atualizarFn = useServerFn(atualizarUnidade);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const podeGerenciar = perfil?.role === "master" || perfil?.role === "gerente";

  const { data: empreendimentos, isLoading: carregandoEmp } = useQuery({
    queryKey: ["empreendimentos"],
    queryFn: () => fetchEmpreendimentos(),
  });

  const [empId, setEmpId] = useState<string>("");
  const empAtual = empreendimentos?.find((e: any) => e.id === empId) ?? empreendimentos?.[0];
  const empIdEfetivo = empId || empAtual?.id || "";

  const { data: unidades, isLoading: carregandoUnidades } = useQuery({
    queryKey: ["unidades", empIdEfetivo],
    queryFn: () => fetchUnidades({ data: { empreendimento_id: empIdEfetivo } }),
    enabled: !!empIdEfetivo,
  });

  const { data: leads } = useQuery({ queryKey: ["leads"], queryFn: () => fetchLeads() });

  const [loteOpen, setLoteOpen] = useState(false);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<any | null>(null);

  const invalidarUnidades = () => qc.invalidateQueries({ queryKey: ["unidades", empIdEfetivo] });

  const porTorre = useMemo(() => {
    const grupos = new Map<string, any[]>();
    for (const u of unidades ?? []) {
      if (!grupos.has(u.torre)) grupos.set(u.torre, []);
      grupos.get(u.torre)!.push(u);
    }
    for (const lista of grupos.values()) {
      lista.sort((a, b) => (b.andar - a.andar) || String(a.numero).localeCompare(String(b.numero)));
    }
    return grupos;
  }, [unidades]);

  const resumo = useMemo(() => {
    const total = unidades?.length ?? 0;
    const contagem = { disponivel: 0, reservada: 0, vendida: 0, bloqueada: 0 } as Record<string, number>;
    for (const u of unidades ?? []) contagem[u.status] = (contagem[u.status] ?? 0) + 1;
    return { total, ...contagem };
  }, [unidades]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Espelho de Vendas</h1>
          <p className="text-sm text-muted-foreground">Disponibilidade de unidades em tempo real</p>
        </div>
        {podeGerenciar && empIdEfetivo && (
          <Button size="sm" onClick={() => setLoteOpen(true)}>
            <Plus className="mr-2 size-4" /> Cadastrar unidades
          </Button>
        )}
      </div>

      {carregandoEmp ? (
        <div className="text-sm text-muted-foreground">Carregando empreendimentos…</div>
      ) : (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Building2 className="size-4 text-muted-foreground" />
          <Select value={empIdEfetivo} onValueChange={setEmpId}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Selecione o empreendimento" />
            </SelectTrigger>
            <SelectContent>
              {(empreendimentos ?? []).map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!!unidades?.length && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-500/50 text-emerald-700">{resumo.disponivel} disponível(is)</Badge>
              <Badge variant="outline" className="border-amber-500/50 text-amber-700">{resumo.reservada} reservada(s)</Badge>
              <Badge variant="outline" className="border-rose-500/50 text-rose-700">{resumo.vendida} vendida(s)</Badge>
              <Badge variant="outline" className="text-muted-foreground">{resumo.bloqueada} bloqueada(s)</Badge>
            </div>
          )}
        </Card>
      )}

      {carregandoUnidades && <div className="text-sm text-muted-foreground">Carregando unidades…</div>}

      {empIdEfetivo && !carregandoUnidades && (unidades?.length ?? 0) === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma unidade cadastrada ainda para este empreendimento.
          {podeGerenciar && " Clique em \"Cadastrar unidades\" para gerar a planta em lote."}
        </Card>
      )}

      <div className="space-y-6">
        {[...porTorre.entries()].map(([torre, lista]) => {
          const andares = [...new Set(lista.map((u) => u.andar))].sort((a, b) => b - a);
          return (
            <Card key={torre} className="p-4">
              <h2 className="mb-3 font-semibold">{torre}</h2>
              <div className="space-y-1.5">
                {andares.map((andar) => (
                  <div key={andar} className="flex items-center gap-1.5">
                    <div className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">{andar}º</div>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {lista.filter((u) => u.andar === andar).map((u) => (
                        <button
                          key={u.id}
                          onClick={() => setUnidadeSelecionada(u)}
                          className={`min-w-[52px] rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${CORES[u.status] ?? CORES.bloqueada}`}
                          title={`${u.numero} · ${LABEL_STATUS[u.status]}`}
                        >
                          {u.numero}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Cadastro em lote */}
      <Dialog open={loteOpen} onOpenChange={setLoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar unidades em lote</DialogTitle></DialogHeader>
          <FormLote
            onSubmit={async (dados) => {
              try {
                const r = await criarLoteFn({ data: { empreendimento_id: empIdEfetivo, ...dados } });
                toast.success(`${r.criadas} unidade(s) geradas.`);
                setLoteOpen(false);
                invalidarUnidades();
              } catch (e: any) {
                toast.error(e.message ?? "Erro ao gerar unidades");
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Detalhe / ação da unidade */}
      <Dialog open={!!unidadeSelecionada} onOpenChange={(v) => !v && setUnidadeSelecionada(null)}>
        <DialogContent>
          {unidadeSelecionada && (
            <UnidadeDetalhe
              unidade={unidadeSelecionada}
              podeGerenciar={!!podeGerenciar}
              leads={leads ?? []}
              onReservar={async (leadId, clienteNome) => {
                try {
                  await reservarFn({ data: { unidade_id: unidadeSelecionada.id, lead_id: leadId, cliente_nome: clienteNome } });
                  toast.success("Unidade reservada.");
                  setUnidadeSelecionada(null);
                  invalidarUnidades();
                } catch (e: any) {
                  toast.error(e.message ?? "Erro ao reservar");
                }
              }}
              onLiberar={async () => {
                try {
                  await liberarFn({ data: { unidade_id: unidadeSelecionada.id } });
                  toast.success("Unidade liberada.");
                  setUnidadeSelecionada(null);
                  invalidarUnidades();
                } catch (e: any) {
                  toast.error(e.message ?? "Erro ao liberar");
                }
              }}
              onAtualizarStatus={async (status) => {
                try {
                  await atualizarFn({ data: { id: unidadeSelecionada.id, status } });
                  toast.success("Atualizado.");
                  setUnidadeSelecionada(null);
                  invalidarUnidades();
                } catch (e: any) {
                  toast.error(e.message ?? "Erro ao atualizar");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormLote({ onSubmit }: { onSubmit: (d: any) => Promise<void> }) {
  const [torre, setTorre] = useState("Torre A");
  const [andarInicial, setAndarInicial] = useState(1);
  const [andarFinal, setAndarFinal] = useState(10);
  const [porAndar, setPorAndar] = useState(4);
  const [tipologia, setTipologia] = useState("2 quartos");
  const [area, setArea] = useState<number | "">("");
  const [valor, setValor] = useState<number | "">("");
  const [enviando, setEnviando] = useState(false);

  const total = Math.max(0, andarFinal - andarInicial + 1) * porAndar;

  return (
    <div className="space-y-3">
      <div>
        <Label>Torre / Bloco</Label>
        <Input value={torre} onChange={(e) => setTorre(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Andar inicial</Label><Input type="number" value={andarInicial} onChange={(e) => setAndarInicial(Number(e.target.value))} /></div>
        <div><Label>Andar final</Label><Input type="number" value={andarFinal} onChange={(e) => setAndarFinal(Number(e.target.value))} /></div>
        <div><Label>Unid./andar</Label><Input type="number" value={porAndar} onChange={(e) => setPorAndar(Number(e.target.value))} /></div>
      </div>
      <div><Label>Tipologia (padrão)</Label><Input value={tipologia} onChange={(e) => setTipologia(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Área m² (padrão)</Label><Input type="number" value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : "")} /></div>
        <div><Label>Valor R$ (padrão)</Label><Input type="number" value={valor} onChange={(e) => setValor(e.target.value ? Number(e.target.value) : "")} /></div>
      </div>
      <div className="text-xs text-muted-foreground">Serão geradas {total} unidade(s) (numeração automática: andar + posição, ex: 101, 102…).</div>
      <DialogFooter>
        <Button
          disabled={enviando || total <= 0}
          onClick={async () => {
            setEnviando(true);
            await onSubmit({
              torre, andar_inicial: andarInicial, andar_final: andarFinal, unidades_por_andar: porAndar,
              tipologia: tipologia || null, area_m2: area || null, valor: valor || null,
            });
            setEnviando(false);
          }}
        >
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
          Gerar unidades
        </Button>
      </DialogFooter>
    </div>
  );
}

function UnidadeDetalhe({
  unidade, podeGerenciar, leads, onReservar, onLiberar, onAtualizarStatus,
}: {
  unidade: any; podeGerenciar: boolean; leads: any[];
  onReservar: (leadId: string | null, clienteNome: string | null) => Promise<void>;
  onLiberar: () => Promise<void>;
  onAtualizarStatus: (status: string) => Promise<void>;
}) {
  const [leadId, setLeadId] = useState<string>("");
  const [clienteNome, setClienteNome] = useState("");

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Unidade {unidade.numero} · {unidade.torre}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Status: </span><Badge variant="outline">{LABEL_STATUS[unidade.status]}</Badge></div>
        {unidade.tipologia && <div><span className="text-muted-foreground">Tipologia: </span>{unidade.tipologia}</div>}
        {unidade.area_m2 && <div><span className="text-muted-foreground">Área: </span>{unidade.area_m2} m²</div>}
        {unidade.valor && <div><span className="text-muted-foreground">Valor: </span>{Number(unidade.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>}
        {unidade.corretores?.nome && <div className="col-span-2"><span className="text-muted-foreground">Corretor: </span>{unidade.corretores.nome}</div>}
        {unidade.cliente_nome && <div className="col-span-2"><span className="text-muted-foreground">Cliente: </span>{unidade.cliente_nome}</div>}
      </div>

      {unidade.status === "disponivel" && (
        <div className="space-y-2 border-t pt-3">
          <Label>Vincular a um lead (opcional)</Label>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger><SelectValue placeholder="Nenhum lead selecionado" /></SelectTrigger>
            <SelectContent>
              {leads.map((l: any) => (
                <SelectItem key={l.id} value={l.id}>{l.nome} · {l.telefone ?? "sem telefone"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Ou nome do cliente (se não estiver na base de leads)</Label>
          <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          <DialogFooter>
            <Button onClick={() => onReservar(leadId || null, clienteNome || null)}>Reservar unidade</Button>
          </DialogFooter>
        </div>
      )}

      {unidade.status === "reservada" && (
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onLiberar}><Unlock className="mr-2 size-4" /> Liberar reserva</Button>
          {podeGerenciar && <Button onClick={() => onAtualizarStatus("vendida")}>Marcar como vendida</Button>}
        </DialogFooter>
      )}

      {podeGerenciar && unidade.status === "vendida" && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onAtualizarStatus("disponivel")}>Reverter para disponível</Button>
        </DialogFooter>
      )}

      {podeGerenciar && unidade.status === "bloqueada" && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onAtualizarStatus("disponivel")}><Unlock className="mr-2 size-4" /> Desbloquear</Button>
        </DialogFooter>
      )}

      {podeGerenciar && unidade.status === "disponivel" && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onAtualizarStatus("bloqueada")}><Lock className="mr-2 size-4" /> Bloquear</Button>
        </DialogFooter>
      )}
    </div>
  );
}
