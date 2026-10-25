import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LocateFixed, MapPin, Network, QrCode, Save } from "lucide-react";
import { toast } from "sonner";
import { atualizarLocal, definirLocalAtivo, regerarQrLocal, salvarLocal } from "@/lib/checkin.functions";
import { meuIpAtual } from "@/lib/config-acesso.functions";
import { useGeolocalizacao } from "@/hooks/use-geolocalizacao";
import { baixarQrPng, enderecoDoPonto, qrSvg } from "@/lib/qr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { tr } from "@/i18n";
export const LIMITE_PONTOS = 10;

export type Ponto = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
  ativo: boolean;
  usa_gps: boolean;
  usa_ip: boolean;
  ip_fixo: string | null;
  qr_codigo: string;
};

type Dados = {
  nome: string;
  usa_gps: boolean;
  usa_ip: boolean;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
  ip_fixo: string | null;
};

function numero(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formulário de um ponto (novo ou existente): nome, métodos de login, localização e IP. */
function PontoForm({
  inicial,
  rotuloSalvar,
  salvando,
  onSalvar,
}: {
  inicial?: Ponto;
  rotuloSalvar: string;
  salvando: boolean;
  onSalvar: (d: Dados) => void;
}) {
  const { obter, carregando } = useGeolocalizacao();
  const ipFn = useServerFn(meuIpAtual);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [usaGps, setUsaGps] = useState(inicial?.usa_gps ?? true);
  const [usaIp, setUsaIp] = useState(inicial?.usa_ip ?? false);
  const [lat, setLat] = useState(inicial?.latitude != null ? String(inicial.latitude) : "");
  const [lng, setLng] = useState(inicial?.longitude != null ? String(inicial.longitude) : "");
  const [raio, setRaio] = useState(String(inicial?.raio_metros ?? 150));
  const [ip, setIp] = useState(inicial?.ip_fixo ?? "");

  // Se o ponto for salvo e a lista recarregar, mantém o formulário em dia.
  useEffect(() => {
    if (!inicial) return;
    setNome(inicial.nome);
    setUsaGps(inicial.usa_gps);
    setUsaIp(inicial.usa_ip);
    setLat(inicial.latitude != null ? String(inicial.latitude) : "");
    setLng(inicial.longitude != null ? String(inicial.longitude) : "");
    setRaio(String(inicial.raio_metros));
    setIp(inicial.ip_fixo ?? "");
  }, [inicial]);

  async function usarMinhaLocalizacao() {
    try {
      const p = await obter();
      setLat(p.latitude.toFixed(6));
      setLng(p.longitude.toFixed(6));
      toast.success(tr("Localização capturada (erro de cerca de {round} m).", { round: Math.round(p.precisaoMetros) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Não consegui pegar a localização."));
    }
  }

  async function usarMeuIp() {
    try {
      const r = await ipFn();
      if (!r.ip) throw new Error(tr("Não consegui descobrir o seu IP."));
      setIp(r.ip);
      toast.success(tr("IP preenchido com o da sua internet de agora."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Não consegui descobrir o seu IP."));
    }
  }

  const latN = numero(lat);
  const lngN = numero(lng);
  const raioN = Math.round(Number(raio));
  const gpsOk = !usaGps || (latN != null && lngN != null && raioN >= 20 && raioN <= 5000);
  const ipOk = !usaIp || /^[0-9a-fA-F:.]{3,45}$/.test(ip.trim());
  const pronto = nome.trim().length >= 2 && (usaGps || usaIp) && gpsOk && ipOk;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`ponto-nome-${inicial?.id ?? "novo"}`}>{tr("Nome do ponto")}</Label>
        <Input
          id={`ponto-nome-${inicial?.id ?? "novo"}`}
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          placeholder={tr("Ex.: Stand Vista Plaza")}
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2"><MapPin className="size-4" /> {tr("Login por localização (GPS)")}</Label>
          <Switch checked={usaGps} onCheckedChange={setUsaGps} />
        </div>
        {usaGps && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{tr("Latitude")}</Label>
              <Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.6" />
            </div>
            <div>
              <Label>{tr("Longitude")}</Label>
              <Input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.7" />
            </div>
            <div>
              <Label>{tr("Raio (metros)")}</Label>
              <Input inputMode="numeric" value={raio} onChange={(e) => setRaio(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Button type="button" variant="outline" size="sm" onClick={usarMinhaLocalizacao} disabled={carregando}>
                <LocateFixed className="mr-2 size-4" />
                {carregando ? tr("Pegando…") : tr("Usar minha localização atual")}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{tr("Fique no ponto e toque no botão.")}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2"><Network className="size-4" /> {tr("Login por IP fixo")}</Label>
          <Switch checked={usaIp} onCheckedChange={setUsaIp} />
        </div>
        {usaIp && (
          <div className="space-y-2">
            <Label>{tr("IP da internet do ponto")}</Label>
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder={tr("Ex.: 200.150.10.5")} />
            <Button type="button" variant="outline" size="sm" onClick={usarMeuIp}>{tr("Usar o IP da minha internet agora")}</Button>
            <p className="text-xs text-muted-foreground">{tr("Só funciona se a internet do ponto tiver IP fixo.")}</p>
          </div>
        )}
      </div>

      {!usaGps && !usaIp && <p className="text-sm text-amber-600">{tr("Escolha ao menos um método: localização ou IP fixo.")}</p>}

      <Button
        type="button"
        disabled={!pronto || salvando}
        onClick={() =>
          onSalvar({
            nome: nome.trim(),
            usa_gps: usaGps,
            usa_ip: usaIp,
            latitude: usaGps ? latN : null,
            longitude: usaGps ? lngN : null,
            raio_metros: Number.isFinite(raioN) ? raioN : 150,
            ip_fixo: usaIp ? ip.trim() : null,
          })
        }
      >
        <Save className="mr-2 size-4" /> {rotuloSalvar}
      </Button>
    </div>
  );
}

/** Mostra o QR fixo do ponto, com download e (com confirmação) troca do código. */
function QrDialog({ ponto, onFechar }: { ponto: Ponto | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const regerarFn = useServerFn(regerarQrLocal);
  const [baixando, setBaixando] = useState(false);

  const regerar = useMutation({
    mutationFn: (id: string) => regerarFn({ data: { id } }),
    onSuccess: () => {
      toast.success(tr("QR novo gerado. O QR antigo deixou de valer."));
      qc.invalidateQueries({ queryKey: ["locais_checkin"] });
      onFechar();
    },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não foi possível gerar um QR novo.")),
  });

  const endereco = ponto ? enderecoDoPonto(ponto.qr_codigo) : "";

  async function baixar() {
    if (!ponto) return;
    setBaixando(true);
    try {
      await baixarQrPng(endereco, `qr-${ponto.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ponto"}`, ponto.nome);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Não consegui baixar o QR."));
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Dialog open={!!ponto} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("QR do ponto “{nome}”", { nome: ponto?.nome })}</DialogTitle>
          <DialogDescription>{tr("Este QR é fixo: ele não muda. Imprima e cole no ponto. Quem escanear faz o check-in aqui.")}</DialogDescription>
        </DialogHeader>
        {ponto && (
          <div className="space-y-3">
            <div
              className="mx-auto w-64 rounded-lg border bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
              // O SVG é gerado aqui mesmo, só a partir do código do ponto (letras e números).
              dangerouslySetInnerHTML={{ __html: qrSvg(endereco) }}
            />
            <p className="break-all text-center text-xs text-muted-foreground">{endereco}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={baixar} disabled={baixando}>
                {baixando ? tr("Gerando…") : tr("Baixar imagem (PNG)")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive">{tr("Gerar QR novo")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tr("Trocar o QR deste ponto?")}</AlertDialogTitle>
                    <AlertDialogDescription>{tr("O QR que já está impresso vai parar de funcionar. Só faça isso se o QR atual vazou ou foi perdido.")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tr("Cancelar")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => regerar.mutate(ponto.id)}>{tr("Trocar o QR")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PontosCard({ pontos }: { pontos: Ponto[] }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarLocal);
  const atualizarFn = useServerFn(atualizarLocal);
  const ativoFn = useServerFn(definirLocalAtivo);
  const [qrDe, setQrDe] = useState<Ponto | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["locais_checkin"] });

  const criar = useMutation({
    mutationFn: (d: Dados) => salvarFn({ data: d }),
    onSuccess: () => {
      toast.success(tr("Ponto criado."));
      setNovoAberto(false);
      recarregar();
    },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não foi possível criar o ponto.")),
  });

  const editar = useMutation({
    mutationFn: (v: { id: string; dados: Dados }) => atualizarFn({ data: v }),
    onSuccess: () => {
      toast.success(tr("Ponto salvo."));
      recarregar();
    },
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não foi possível salvar.")),
  });

  const alternar = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => ativoFn({ data: v }),
    onSuccess: recarregar,
    onError: (e: any) => toast.error(tr(e?.message) ?? tr("Não foi possível alterar.")),
  });

  const cheio = pontos.length >= LIMITE_PONTOS;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{tr("Pontos de acesso")}</h2>
          <p className="text-xs text-muted-foreground">{tr("Até {LIMITE_PONTOS} pontos por imobiliária. {length} de {LIMITE_PONTOS} usados.", { LIMITE_PONTOS, length: pontos.length })}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setNovoAberto((v) => !v)} disabled={cheio}>
          {novoAberto ? tr("Fechar") : tr("Novo ponto")}
        </Button>
      </div>

      {novoAberto && (
        <div className="rounded-lg border border-dashed p-4">
          <PontoForm rotuloSalvar={tr("Criar ponto")} salvando={criar.isPending} onSalvar={(d) => criar.mutate(d)} />
        </div>
      )}

      <div className="space-y-2">
        {pontos.map((p) => {
          const aberto = abertoId === p.id;
          return (
            <div key={p.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.nome}</span>
                {p.usa_gps && <Badge variant="secondary">{tr("GPS · {raio_metros} m", { raio_metros: p.raio_metros })}</Badge>}
                {p.usa_ip && <Badge variant="secondary">{tr("IP {ip_fixo}", { ip_fixo: p.ip_fixo })}</Badge>}
                {!p.ativo && <Badge variant="outline">{tr("desativado")}</Badge>}
                <div className="ml-auto flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => setQrDe(p)}>
                    <QrCode className="mr-1 size-4" /> {tr("QR")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAbertoId(aberto ? null : p.id)}>
                    {aberto ? tr("Fechar") : tr("Editar")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={alternar.isPending}
                    onClick={() => alternar.mutate({ id: p.id, ativo: !p.ativo })}
                  >
                    {p.ativo ? tr("Desativar") : tr("Ativar")}
                  </Button>
                </div>
              </div>
              {aberto && (
                <div className="mt-3 border-t pt-3">
                  <PontoForm
                    inicial={p}
                    rotuloSalvar={tr("Salvar alterações")}
                    salvando={editar.isPending}
                    onSalvar={(dados) => editar.mutate({ id: p.id, dados })}
                  />
                </div>
              )}
            </div>
          );
        })}
        {pontos.length === 0 && <p className="text-sm text-muted-foreground">{tr("Nenhum ponto cadastrado ainda.")}</p>}
      </div>

      <QrDialog ponto={qrDe} onFechar={() => setQrDe(null)} />
    </Card>
  );
}
