import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Phone, Users, Handshake, MapPin } from "lucide-react";
import { toast } from "sonner";
import { meuPerfil } from "@/lib/perfis.functions";
import { atualizarCompromisso, listarCompromissos } from "@/lib/agenda.functions";
import {
  ROTULO_STATUS,
  ROTULO_TIPO,
  diaSP,
  horaSP,
  hojeSP,
  inicioDaSemana,
  inicioDoDiaISO,
  inputLocalParaISO,
  isoParaInputLocal,
  rotuloDia,
  somarDias,
  type StatusCompromisso,
} from "@/lib/agenda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: tr("Agenda — Alexandria Leds") }] }),
  component: AgendaPage,
});

type Visao = "dia" | "semana";
type Item = Awaited<ReturnType<typeof listarCompromissos>>[number];

const ICONE_TIPO = { visita: MapPin, ligacao: Phone, reuniao: Handshake } as const;

function lerVisao(): Visao {
  try {
    return localStorage.getItem("agenda_visao") === "semana" ? "semana" : "dia";
  } catch {
    return "dia";
  }
}

function AgendaPage() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const listarFn = useServerFn(listarCompromissos);
  const atualizarFn = useServerFn(atualizarCompromisso);

  const [visao, setVisao] = useState<Visao>("dia");
  const [dia, setDia] = useState(hojeSP());
  const [filtroCorretor, setFiltroCorretor] = useState("todos");
  const [remarcando, setRemarcando] = useState<Item | null>(null);

  useEffect(() => setVisao(lerVisao()), []);
  function trocarVisao(v: Visao) {
    setVisao(v);
    try { localStorage.setItem("agenda_visao", v); } catch { /* sem armazenamento: segue sem lembrar */ }
  }

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const ehEquipe = !!perfil && (perfil.role === "master" || perfil.role === "gerente" || perfil.super_admin);

  const primeiroDia = visao === "semana" ? inicioDaSemana(dia) : dia;
  const dias = useMemo(
    () => Array.from({ length: visao === "semana" ? 7 : 1 }, (_, i) => somarDias(primeiroDia, i)),
    [visao, primeiroDia],
  );
  const de = inicioDoDiaISO(primeiroDia);
  const ate = inicioDoDiaISO(somarDias(primeiroDia, dias.length));

  const { data: itens, isLoading } = useQuery({
    queryKey: ["compromissos", de, ate],
    queryFn: () => listarFn({ data: { de, ate } }),
    refetchInterval: 60_000,
  });

  const corretores = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itens ?? []) if (i.corretor_id && i.corretor_nome) m.set(i.corretor_id, i.corretor_nome);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens]);

  const filtrados = (itens ?? []).filter((i) => filtroCorretor === "todos" || i.corretor_id === filtroCorretor);
  const porDia = new Map<string, Item[]>(dias.map((d) => [d, []]));
  for (const i of filtrados) porDia.get(diaSP(i.data_hora))?.push(i);

  const mudar = useMutation({
    mutationFn: (v: { id: string; status?: StatusCompromisso; data_hora?: string }) => atualizarFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compromissos"] }),
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não foi possível atualizar.")),
  });

  const hoje = hojeSP();
  const titulo =
    visao === "dia"
      ? dia === hoje ? "Hoje" : rotuloDia(dia)
      : tr("{inicio} a {fim}", { inicio: rotuloDia(dias[0]), fim: rotuloDia(dias[6]) });
  const agendadosNoPeriodo = filtrados.filter((i) => i.status === "agendado").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="size-6" /> {tr("Agenda")}</h1>
          <p className="text-sm text-muted-foreground">
            {ehEquipe ? tr("Compromissos da equipe.") : tr("Seus compromissos.")} {tr("{agendadosNoPeriodo} por fazer neste período.", { agendadosNoPeriodo })}</p>
        </div>
        <div className="ml-auto inline-flex rounded-lg border p-0.5">
          {(["dia", "semana"] as const).map((v) => (
            <Button key={v} type="button" size="sm" variant={visao === v ? "default" : "ghost"} onClick={() => trocarVisao(v)}>
              {v === "dia" ? tr("Dia") : tr("Semana")}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={tr("Anterior")} onClick={() => setDia(somarDias(dia, visao === "semana" ? -7 : -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" variant="outline" onClick={() => setDia(hoje)}>{tr("Hoje")}</Button>
        <Button type="button" variant="outline" size="icon" aria-label={tr("Próximo")} onClick={() => setDia(somarDias(dia, visao === "semana" ? 7 : 1))}>
          <ChevronRight className="size-4" />
        </Button>
        <span className="px-2 text-sm font-semibold">{titulo}</span>
        {ehEquipe && corretores.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <select className="rounded-md border bg-background p-2 text-sm" value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)}>
              <option value="todos">{tr("Toda a equipe")}</option>
              {corretores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </label>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tr("Carregando…")}</p>
      ) : (
        <div className={cn("grid gap-3", visao === "semana" && "md:grid-cols-2 xl:grid-cols-4")}>
          {dias.map((d) => {
            const lista = porDia.get(d) ?? [];
            return (
              <div key={d} className={cn("space-y-2", visao === "semana" && "rounded-xl border bg-muted/20 p-3")}>
                {visao === "semana" && (
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className={cn(d === hoje && "text-primary")}>{d === hoje ? tr("Hoje · ") : ""}{rotuloDia(d)}</span>
                    <Badge variant="secondary">{lista.length}</Badge>
                  </div>
                )}
                {lista.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">{tr("Nada agendado.")}</p>
                )}
                {lista.map((i) => (
                  <CartaoCompromisso
                    key={i.id}
                    item={i}
                    mostrarCorretor={ehEquipe}
                    ocupado={mudar.isPending}
                    aoMudarStatus={(status) => mudar.mutate({ id: i.id, status })}
                    aoRemarcar={() => setRemarcando(i)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <RemarcarDialog
        item={remarcando}
        aoFechar={() => setRemarcando(null)}
        aoConfirmar={(iso) => {
          if (!remarcando) return;
          mudar.mutate({ id: remarcando.id, data_hora: iso }, { onSuccess: () => { toast.success(tr("Compromisso remarcado.")); setRemarcando(null); } });
        }}
      />
    </div>
  );
}

function CartaoCompromisso({
  item,
  mostrarCorretor,
  ocupado,
  aoMudarStatus,
  aoRemarcar,
}: {
  item: Item;
  mostrarCorretor: boolean;
  ocupado: boolean;
  aoMudarStatus: (s: StatusCompromisso) => void;
  aoRemarcar: () => void;
}) {
  const tipo = (item.tipo in ICONE_TIPO ? item.tipo : "visita") as keyof typeof ICONE_TIPO;
  const Icone = ICONE_TIPO[tipo];
  const agendado = item.status === "agendado";
  const atrasado = agendado && new Date(item.data_hora).getTime() < Date.now();
  const digitos = (item.lead_telefone ?? "").replace(/\D/g, "");
  const whats = digitos ? `https://wa.me/${digitos.length <= 11 ? "55" + digitos : digitos}` : null;

  return (
    <Card className={cn("space-y-2 p-3", atrasado && "border-amber-500")}>
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icone className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-bold">{horaSP(item.data_hora)}</span>
            <span className="text-xs text-muted-foreground">{tr(ROTULO_TIPO[tipo])}</span>
            <Badge variant={agendado ? "outline" : item.status === "realizado" ? "default" : "secondary"} className="ml-auto">
              {tr(ROTULO_STATUS[item.status as StatusCompromisso] ?? item.status)}
            </Badge>
          </div>
          <div className="truncate text-sm font-medium">{item.lead_nome ?? tr("Sem lead")}</div>
          {item.empreendimento && <div className="truncate text-xs text-muted-foreground">{item.empreendimento}</div>}
          {mostrarCorretor && item.corretor_nome && <div className="truncate text-xs text-muted-foreground">{tr("Corretor: {corretor_nome}", { corretor_nome: item.corretor_nome })}</div>}
          {item.observacoes && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.observacoes}</div>}
        </div>
      </div>

      {atrasado && <p className="text-xs font-medium text-amber-600">{tr("O horário passou. Registre como foi.")}</p>}

      <div className="flex flex-wrap gap-1.5">
        {whats && (
          <Button asChild size="sm" variant="ghost">
            <a href={whats} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 size-4" /> {tr("WhatsApp")}</a>
          </Button>
        )}
        {agendado ? (
          <>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => aoMudarStatus("realizado")}>{tr("Realizado")}</Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => aoMudarStatus("nao_compareceu")}>{tr("Não compareceu")}</Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={aoRemarcar}>{tr("Remarcar")}</Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => aoMudarStatus("cancelado")}>{tr("Cancelar")}</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => aoMudarStatus("agendado")}>{tr("Reabrir")}</Button>
        )}
      </div>
    </Card>
  );
}

function RemarcarDialog({
  item,
  aoFechar,
  aoConfirmar,
}: {
  item: Item | null;
  aoFechar: () => void;
  aoConfirmar: (iso: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (item) { setValor(isoParaInputLocal(item.data_hora)); setErro(null); }
  }, [item?.id]);

  function confirmar() {
    const iso = inputLocalParaISO(valor);
    if (!iso) return setErro(tr("Escolha a data e a hora."));
    if (new Date(iso).getTime() < Date.now() - 5 * 60_000) return setErro(tr("Escolha uma data e hora no futuro."));
    aoConfirmar(iso);
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Remarcar compromisso")}</DialogTitle>
          <DialogDescription>{item?.lead_nome ?? ""}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="rem-quando">{tr("Nova data e hora")}</Label>
          <Input id="rem-quando" type="datetime-local" value={valor} onChange={(e) => { setValor(e.target.value); setErro(null); }} />
          <p className="mt-1 text-xs text-muted-foreground">{tr("O lembrete no WhatsApp será refeito para o novo horário.")}</p>
          {erro && <p className="mt-1 text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>{tr("Cancelar")}</Button>
          <Button onClick={confirmar}>{tr("Remarcar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
