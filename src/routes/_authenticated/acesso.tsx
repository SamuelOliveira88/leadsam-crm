import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Clock, MapPin, Network, ShieldCheck, Unlock, UserCheck } from "lucide-react";
import { meuPerfil } from "@/lib/perfis.functions";
import { getConfigAcesso, salvarConfigAcesso, liberarAgora, revogarLiberacao, meuIpAtual } from "@/lib/config-acesso.functions";
import { listarCorretores, liberarCorretor, revogarLiberacaoCorretor } from "@/lib/corretores.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { tr, localeAtual } from "@/i18n";
export const Route = createFileRoute("/_authenticated/acesso")({
  component: AcessoPage,
});

function AcessoPage() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const getFn = useServerFn(getConfigAcesso);
  const salvarFn = useServerFn(salvarConfigAcesso);
  const liberarFn = useServerFn(liberarAgora);
  const revogarFn = useServerFn(revogarLiberacao);
  const listCorretoresFn = useServerFn(listarCorretores);
  const liberarCorretorFn = useServerFn(liberarCorretor);
  const revogarCorretorFn = useServerFn(revogarLiberacaoCorretor);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const { data: config } = useQuery({ queryKey: ["config_acesso"], queryFn: () => getFn() });
  const { data: corretores } = useQuery({ queryKey: ["corretores"], queryFn: () => listCorretoresFn() });

  const ipFn = useServerFn(meuIpAtual);
  const { data: meuIp } = useQuery({ queryKey: ["meu_ip"], queryFn: () => ipFn() });
  const [restringirIp, setRestringirIp] = useState(false);
  const [ipsTexto, setIpsTexto] = useState("");
  const [restringirLocal, setRestringirLocal] = useState(false);
  const [restringir, setRestringir] = useState(false);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("09:30");
  const [minutos, setMinutos] = useState(60);
  const [corretorSel, setCorretorSel] = useState<string>("");
  const [minutosCorretor, setMinutosCorretor] = useState(60);

  useEffect(() => {
    if (!config) return;
    setRestringir(config.restringir_horario);
    setRestringirIp(!!(config as any).restringir_ip);
    setIpsTexto(((config as any).ips_permitidos ?? []).join("\n"));
    setRestringirLocal(!!(config as any).restringir_local);
    setInicio(String(config.hora_inicio).slice(0, 5));
    setFim(String(config.hora_fim).slice(0, 5));
  }, [config]);

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: {
      restringir_horario: restringir,
      hora_inicio: inicio + ":00",
      hora_fim: fim + ":00",
      liberado_ate: config?.liberado_ate ?? null,
      restringir_ip: restringirIp,
      ips_permitidos: ipsTexto.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
      restringir_local: restringirLocal,
    } }),
    onSuccess: () => { toast.success(tr("Configuração salva")); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Erro ao salvar")),
  });

  const liberar = useMutation({
    mutationFn: (m: number) => liberarFn({ data: { minutos: m } }),
    onSuccess: () => { toast.success(tr("Acesso liberado")); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Erro")),
  });

  const revogar = useMutation({
    mutationFn: () => revogarFn(),
    onSuccess: () => { toast.success(tr("Liberação revogada")); qc.invalidateQueries({ queryKey: ["config_acesso"] }); },
  });

  const liberarUm = useMutation({
    mutationFn: (p: { corretor_id: string; minutos: number }) => liberarCorretorFn({ data: p }),
    onSuccess: () => { toast.success(tr("Corretor liberado")); qc.invalidateQueries({ queryKey: ["corretores"] }); },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Erro")),
  });

  const revogarUm = useMutation({
    mutationFn: (corretor_id: string) => revogarCorretorFn({ data: { corretor_id } }),
    onSuccess: () => { toast.success(tr("Liberação removida")); qc.invalidateQueries({ queryKey: ["corretores"] }); },
  });

  if (perfil && perfil.role !== "master" && perfil.role !== "gerente") {
    return <div className="rounded-xl border bg-card p-6">{tr("Acesso negado.")}</div>;
  }

  const liberadoAte = config?.liberado_ate ? new Date(config.liberado_ate) : null;
  const liberacaoAtiva = liberadoAte && liberadoAte.getTime() > Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tr("Controle de Acesso")}</h1>
        <p className="text-sm text-muted-foreground">{tr("Defina se corretores e gerentes têm restrição de horário, ou libere o acesso imediatamente.")}</p>
      </div>

      {/* Travas de login: por IP e por local */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-1 flex items-center gap-2">
          <Network className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("Login só de IP autorizado")}</h2>
        </div>
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">{tr("Corretores e gerentes só entram se estiverem na internet da imobiliária (IP fixo). Master nunca é barrado.")}</p>
          <Switch checked={restringirIp} onCheckedChange={setRestringirIp} disabled={perfil?.role !== "master"} />
        </div>
        {restringirIp && (
          <div className="space-y-2">
            <Label className="text-xs">{tr("IPs permitidos (um por linha)")}</Label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-2 font-mono text-sm"
              value={ipsTexto}
              onChange={(e) => setIpsTexto(e.target.value)}
              placeholder="200.150.10.5"
            />
            {meuIp?.ip && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{tr("Seu IP agora:")} <strong>{meuIp.ip}</strong>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setIpsTexto((t) => (t.split(/\s+/).includes(meuIp.ip!) ? t : (t.trim() ? t.trim() + "\n" : "") + meuIp.ip))}>{tr("Adicionar este IP")}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("Login só no local de trabalho")}</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">{tr("Corretores e gerentes só entram se o aparelho estiver dentro do raio de um local de plantão cadastrado. Precisa da localização ligada no celular. Sem local cadastrado, a trava não bloqueia ninguém.")}</p>
          <Switch checked={restringirLocal} onCheckedChange={setRestringirLocal} disabled={perfil?.role !== "master"} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{tr("Se as duas travas estiverem ligadas, a pessoa precisa passar nas duas. Lembre de clicar em Salvar abaixo.")}</p>
      </div>

      {/* Liberação imediata */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <Unlock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("Liberar agora")}</h2>
        </div>
        {liberacaoAtiva ? (
          <div className="mb-4 rounded-lg bg-primary/10 p-3 text-sm">{tr("✅ Acesso liberado até")} <strong>{liberadoAte!.toLocaleString(localeAtual())}</strong>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">{tr("Nenhuma liberação temporária ativa.")}</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{tr("Duração (minutos)")}</Label>
            <Input type="number" min={5} max={1440} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="w-32" />
          </div>
          <Button onClick={() => liberar.mutate(minutos)} disabled={liberar.isPending}>{tr("Liberar por {minutos} min", { minutos })}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => liberar.mutate(60)}>{tr("1h")}</Button>
            <Button variant="outline" onClick={() => liberar.mutate(240)}>{tr("4h")}</Button>
            <Button variant="outline" onClick={() => liberar.mutate(1440)}>{tr("24h")}</Button>
          </div>
          {liberacaoAtiva && (
            <Button variant="ghost" onClick={() => revogar.mutate()}>{tr("Revogar")}</Button>
          )}
        </div>
      </div>

      {/* Liberação por corretor */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <UserCheck className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("Liberar um corretor específico")}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{tr("Escolha um corretor e libere o acesso apenas para ele, mesmo fora do horário padrão.")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label className="text-xs">{tr("Corretor")}</Label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={corretorSel}
              onChange={(e) => setCorretorSel(e.target.value)}
            >
              <option value="">{tr("Selecione…")}</option>
              {(corretores ?? []).map((c: any) => {
                const ativo = c.liberado_ate && new Date(c.liberado_ate).getTime() > Date.now();
                return (
                  <option key={c.id} value={c.id}>
                    {c.nome} {ativo ? tr("· ✅ liberado") : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label className="text-xs">{tr("Duração (minutos)")}</Label>
            <Input type="number" min={5} max={1440} value={minutosCorretor} onChange={(e) => setMinutosCorretor(Number(e.target.value))} className="w-32" />
          </div>
          <Button
            disabled={!corretorSel || liberarUm.isPending}
            onClick={() => liberarUm.mutate({ corretor_id: corretorSel, minutos: minutosCorretor })}
          >{tr("Liberar")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!corretorSel} onClick={() => liberarUm.mutate({ corretor_id: corretorSel, minutos: 60 })}>{tr("1h")}</Button>
            <Button variant="outline" disabled={!corretorSel} onClick={() => liberarUm.mutate({ corretor_id: corretorSel, minutos: 240 })}>{tr("4h")}</Button>
            <Button variant="outline" disabled={!corretorSel} onClick={() => liberarUm.mutate({ corretor_id: corretorSel, minutos: 1440 })}>{tr("24h")}</Button>
          </div>
        </div>

        {(corretores ?? []).some((c: any) => c.liberado_ate && new Date(c.liberado_ate).getTime() > Date.now()) && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{tr("Liberações ativas")}</div>
            {(corretores ?? [])
              .filter((c: any) => c.liberado_ate && new Date(c.liberado_ate).getTime() > Date.now())
              .map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{tr("até")} {new Date(c.liberado_ate).toLocaleString(localeAtual())}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revogarUm.mutate(c.id)}>{tr("Revogar")}</Button>
                </div>
              ))}
          </div>
        )}
      </div>


      {/* Regra padrão */}
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("Horário padrão de acesso")}</h2>
        </div>
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">{tr("Restringir acesso por horário")}</Label>
            <p className="text-xs text-muted-foreground">{tr("Quando desligado, corretores e gerentes acessam a qualquer hora.")}</p>
          </div>
          <Switch checked={restringir} onCheckedChange={setRestringir} />
        </div>
        {restringir && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">{tr("Início")}</Label>
              <Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tr("Fim")}</Label>
              <Input type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" />{" "}
            {perfil?.role === "master"
              ? tr("Masters sempre têm acesso irrestrito.")
              : tr("Apenas usuários Master podem alterar o horário padrão.")}
          </div>
          <Button
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending || perfil?.role !== "master"}
          >{tr("Salvar")}</Button>
        </div>
      </div>
    </div>
  );
}
