import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { pontoPorCodigo, registrarCheckinPonto, textoDistancia } from "@/lib/checkin.functions";
import { CheckInButton } from "@/components/CheckInButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { tr } from "@/i18n";
// Página aberta ao escanear o QR fixo de um ponto de acesso.
export const Route = createFileRoute("/_authenticated/ponto/$codigo")({
  head: () => ({ meta: [{ title: tr("Check-in no ponto — Alexandria Leds") }] }),
  component: PontoPage,
});

function PontoPage() {
  const { codigo } = Route.useParams();
  const pontoFn = useServerFn(pontoPorCodigo);
  const registrarFn = useServerFn(registrarCheckinPonto);
  const valido = /^[0-9a-f]{32}$/.test(codigo);
  const [enviandoIp, setEnviandoIp] = useState(false);
  const { data: ponto, isLoading } = useQuery({
    queryKey: ["ponto_qr", codigo],
    queryFn: () => pontoFn({ data: { codigo } }),
    enabled: valido,
  });

  if (!valido || (!isLoading && !ponto)) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="space-y-2 p-5">
          <h1 className="text-xl font-bold">{tr("QR não reconhecido")}</h1>
          <p className="text-sm text-muted-foreground">{tr("Este QR não é de um ponto da sua imobiliária, ou foi trocado. Peça um QR atualizado ao master.")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-primary" />
          <h1 className="text-xl font-bold">{ponto?.nome ?? tr("Carregando…")}</h1>
        </div>
        {ponto && !ponto.ativo && <p className="text-sm text-amber-600">{tr("Este ponto está desativado.")}</p>}
        {ponto && (
          <p className="text-sm text-muted-foreground">
            {ponto.usa_gps && ponto.usa_ip
              ? tr("Vamos conferir a sua localização e a internet do ponto.")
              : ponto.usa_ip
                ? tr("Vamos conferir a internet do ponto.")
                : tr("Vamos conferir a sua localização.")}
          </p>
        )}
        {ponto && !ponto.usa_gps ? (
          // Ponto só de IP: não precisa de localização do aparelho.
          <Button
            type="button"
            className="w-full"
            disabled={!ponto.ativo || enviandoIp}
            onClick={async () => {
              setEnviandoIp(true);
              try {
                const r = await registrarFn({ data: { codigo } });
                toast.success(tr("Check-in feito em {local_nome}.", { local_nome: r.local_nome }));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : tr("Não foi possível fazer o check-in."));
              } finally {
                setEnviandoIp(false);
              }
            }}
          >
            {enviandoIp ? tr("Registrando…") : tr("Fazer check-in neste ponto")}
          </Button>
        ) : (
          <CheckInButton
            rotulo={tr("Fazer check-in neste ponto")}
            disabled={!ponto || !ponto.ativo}
            onConfirmar={async (pos) => {
              const r = await registrarFn({
                data: {
                  codigo,
                  posicao: { latitude: pos.latitude, longitude: pos.longitude, precisaoMetros: pos.precisaoMetros },
                },
              });
              toast.success(
                r.distancia_metros != null
                  ? tr("Check-in feito em {local_nome} ({textoDistancia} do ponto).", { local_nome: r.local_nome, textoDistancia: textoDistancia(r.distancia_metros) })
                  : tr("Check-in feito em {local_nome}.", { local_nome: r.local_nome }),
              );
            }}
          />
        )}
      </Card>
    </div>
  );
}
