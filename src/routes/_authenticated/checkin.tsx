import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { meuPerfil } from "@/lib/perfis.functions";
import {
  definirLocalAtivo,
  listarCheckins,
  listarLocais,
  registrarCheckin,
  salvarLocal,
  linkMapa,
  textoDistancia,
} from "@/lib/checkin.functions";
import { CheckInButton } from "@/components/CheckInButton";
import { useGeolocalizacao } from "@/hooks/use-geolocalizacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/checkin")({
  head: () => ({ meta: [{ title: "Check-in — Alexandria Leds" }] }),
  component: CheckinPage,
});

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function CheckinPage() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const listarFn = useServerFn(listarCheckins);
  const locaisFn = useServerFn(listarLocais);
  const registrarFn = useServerFn(registrarCheckin);

  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const { data: registros } = useQuery({ queryKey: ["checkins"], queryFn: () => listarFn({ data: { dias: 7 } }) });
  const { data: locais } = useQuery({ queryKey: ["locais_checkin"], queryFn: () => locaisFn() });

  const ehMaster = !!(perfil && (perfil.role === "master" || perfil.super_admin));
  const ehEquipe = ehMaster || perfil?.role === "gerente";
  const semLocal = !!locais && !locais.some((l) => l.ativo);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Check-in</h1>
        <p className="text-sm text-muted-foreground">Confirme que você está no plantão. O sistema confere a sua localização.</p>
      </div>

      <Card className="space-y-3 p-5">
        <CheckInButton
          rotulo="Fazer check-in agora"
          disabled={semLocal}
          onConfirmar={async (pos) => {
            const r = await registrarFn({
              data: { latitude: pos.latitude, longitude: pos.longitude, precisaoMetros: pos.precisaoMetros },
            });
            toast.success(`Check-in feito em ${r.local_nome ?? "o local"} (${textoDistancia(r.distancia_metros)} do ponto).`);
            qc.invalidateQueries({ queryKey: ["checkins"] });
          }}
        />
        {semLocal && (
          <p className="text-sm text-amber-600">
            {ehMaster
              ? "Cadastre o local do plantão abaixo para liberar o check-in."
              : "Sua imobiliária ainda não cadastrou o local do plantão. Peça ao master."}
          </p>
        )}
      </Card>

      {ehMaster && <LocaisCard locais={locais ?? []} />}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">{ehEquipe ? "Registros da equipe (7 dias)" : "Meus registros (7 dias)"}</h2>
        <div className="space-y-2">
          {(registros ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
              <span className="font-medium">{r.usuario_nome ?? "—"}</span>
              <Badge variant="secondary">{r.tipo === "checkin" ? "Check-in" : "Login"}</Badge>
              {r.dentro_do_raio === true && <Badge className="bg-emerald-600 text-white">No local</Badge>}
              {r.dentro_do_raio === false && <Badge variant="destructive">Fora do local</Badge>}
              <span className="text-muted-foreground">
                {r.local_nome ? `${r.local_nome} · ${textoDistancia(r.distancia_metros)}` : "sem local cadastrado"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{quando(r.created_at)}</span>
              <a
                href={linkMapa(r.latitude, r.longitude)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                mapa <ExternalLink className="size-3" />
              </a>
            </div>
          ))}
          {registros && registros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>}
        </div>
      </Card>
    </div>
  );
}

type Local = { id: string; nome: string; latitude: number; longitude: number; raio_metros: number; ativo: boolean };

function LocaisCard({ locais }: { locais: Local[] }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarLocal);
  const ativoFn = useServerFn(definirLocalAtivo);
  const { obter, carregando } = useGeolocalizacao();
  const [nome, setNome] = useState("");
  const [raio, setRaio] = useState("150");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  async function usarMinhaLocalizacao() {
    try {
      const p = await obter();
      setLat(p.latitude.toFixed(6));
      setLng(p.longitude.toFixed(6));
      toast.success(`Localização capturada (erro de cerca de ${Math.round(p.precisaoMetros)} m).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pegar a localização.");
    }
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          nome,
          latitude: Number(lat.replace(",", ".")),
          longitude: Number(lng.replace(",", ".")),
          raio_metros: Math.round(Number(raio)),
        },
      }),
    onSuccess: () => {
      toast.success("Local salvo.");
      setNome("");
      setLat("");
      setLng("");
      qc.invalidateQueries({ queryKey: ["locais_checkin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar o local."),
  });

  const alternar = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => ativoFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locais_checkin"] }),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível alterar."),
  });

  const pronto = nome.trim().length >= 2 && lat.trim() !== "" && lng.trim() !== "" && Number(raio) >= 20;

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">Locais de plantão</h2>

      <div className="space-y-2">
        {locais.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="font-medium">{l.nome}</span>
            <span className="text-muted-foreground">raio {l.raio_metros} m</span>
            {!l.ativo && <Badge variant="outline">desativado</Badge>}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={alternar.isPending}
              onClick={() => alternar.mutate({ id: l.id, ativo: !l.ativo })}
            >
              {l.ativo ? "Desativar" : "Ativar"}
            </Button>
          </div>
        ))}
        {locais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum local cadastrado ainda.</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">Novo local</p>
        <p className="text-xs text-muted-foreground">Fique no ponto do plantão e toque em “Usar minha localização atual”.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="loc-nome">Nome</Label>
            <Input id="loc-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Stand Vista Plaza" />
          </div>
          <div>
            <Label htmlFor="loc-lat">Latitude</Label>
            <Input id="loc-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.6" />
          </div>
          <div>
            <Label htmlFor="loc-lng">Longitude</Label>
            <Input id="loc-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.7" />
          </div>
          <div>
            <Label htmlFor="loc-raio">Raio permitido (metros)</Label>
            <Input id="loc-raio" inputMode="numeric" value={raio} onChange={(e) => setRaio(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={usarMinhaLocalizacao} disabled={carregando}>
            <LocateFixed className="mr-2 size-4" />
            {carregando ? "Pegando…" : "Usar minha localização atual"}
          </Button>
          <Button type="button" onClick={() => salvar.mutate()} disabled={!pronto || salvar.isPending}>
            Salvar local
          </Button>
        </div>
      </div>
    </Card>
  );
}
