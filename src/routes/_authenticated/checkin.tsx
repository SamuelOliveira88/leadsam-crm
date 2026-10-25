import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { meuPerfil } from "@/lib/perfis.functions";
import { listarCheckins, listarLocais, registrarCheckin, linkMapa, textoDistancia } from "@/lib/checkin.functions";
import { CheckInButton } from "@/components/CheckInButton";
import { PontosCard } from "@/components/PontosCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { tr, localeAtual } from "@/i18n";
export const Route = createFileRoute("/_authenticated/checkin")({
  head: () => ({ meta: [{ title: tr("Check-in — Alexandria Leds") }] }),
  component: CheckinPage,
});

const quando = (iso: string) =>
  new Date(iso).toLocaleString(localeAtual(), { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

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
  // O botão "Fazer check-in agora" usa o ponto mais próximo por GPS; pontos só de IP entram pelo QR.
  const semLocal = !!locais && !locais.some((l) => l.ativo && l.usa_gps);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tr("Check-in")}</h1>
        <p className="text-sm text-muted-foreground">{tr("Confirme que você está no plantão. O sistema confere a sua localização.")}</p>
      </div>

      <Card className="space-y-3 p-5">
        <CheckInButton
          rotulo={tr("Fazer check-in agora")}
          disabled={semLocal}
          onConfirmar={async (pos) => {
            const r = await registrarFn({
              data: { latitude: pos.latitude, longitude: pos.longitude, precisaoMetros: pos.precisaoMetros },
            });
            toast.success(tr("Check-in feito em {local} ({textoDistancia} do ponto).", { local: r.local_nome ?? tr("o local"), textoDistancia: textoDistancia(r.distancia_metros) }));
            qc.invalidateQueries({ queryKey: ["checkins"] });
          }}
        />
        {semLocal && (
          <p className="text-sm text-amber-600">
            {ehMaster
              ? tr("Cadastre o local do plantão abaixo para liberar o check-in.")
              : tr("Sua imobiliária ainda não cadastrou o local do plantão. Peça ao master.")}
          </p>
        )}
      </Card>

      {ehMaster && <PontosCard pontos={locais ?? []} />}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">{ehEquipe ? tr("Registros da equipe (7 dias)") : tr("Meus registros (7 dias)")}</h2>
        <div className="space-y-2">
          {(registros ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
              <span className="font-medium">{r.usuario_nome ?? "—"}</span>
              <Badge variant="secondary">{r.tipo === "checkin" ? tr("Check-in") : tr("Login")}</Badge>
              {r.metodo && <Badge variant="outline">{r.metodo === "gps+ip" ? tr("GPS + IP") : r.metodo.toUpperCase()}</Badge>}
              {r.dentro_do_raio === true && <Badge className="bg-emerald-600 text-white">{tr("No local")}</Badge>}
              {r.dentro_do_raio === false && <Badge variant="destructive">{tr("Fora do local")}</Badge>}
              <span className="text-muted-foreground">
                {r.local_nome ? `${r.local_nome} · ${textoDistancia(r.distancia_metros)}` : tr("sem local cadastrado")}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{quando(r.created_at)}</span>
              {r.latitude != null && r.longitude != null && (
                <a
                  href={linkMapa(r.latitude, r.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >{tr("mapa")} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          ))}
          {registros && registros.length === 0 && <p className="text-sm text-muted-foreground">{tr("Nenhum registro ainda.")}</p>}
        </div>
      </Card>
    </div>
  );
}
