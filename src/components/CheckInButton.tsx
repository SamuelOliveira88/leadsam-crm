import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGeolocalizacao, ErroGeo } from "@/hooks/use-geolocalizacao";
import { dentroDoRaio, formatarDistancia, type AlvoGeo, type PosicaoGeo } from "@/lib/geo";
import { cn } from "@/lib/utils";

import { tr } from "@/i18n";
type Props = {
  /**
   * Chamado com a posição capturada, quando o check-in é permitido.
   * É aqui que o backend vai gravar o check-in (ainda a ser ligado).
   */
  onConfirmar: (posicao: PosicaoGeo) => Promise<void> | void;
  /** Local do plantão/stand. Se informado, só confirma dentro do raio. */
  alvo?: AlvoGeo;
  rotulo?: string;
  className?: string;
  disabled?: boolean;
};

export function CheckInButton({ onConfirmar, alvo, rotulo = tr("Fazer check-in"), className, disabled }: Props) {
  const { obter, carregando, permissao } = useGeolocalizacao();
  const [enviando, setEnviando] = useState(false);

  // Explica de onde veio a posição quando o sistema diz que a pessoa está longe do ponto.
  function detalhePosicao(pos: PosicaoGeo | null): string {
    if (!pos) return "";
    const lat = pos.latitude.toFixed(5);
    const lon = pos.longitude.toFixed(5);
    const aprox = pos.precisaoMetros > 1000;
    return (
      " " + tr("O navegador informou sua posição em {lat}, {lon} (margem de erro de {margem}).", { lat, lon, margem: formatarDistancia(pos.precisaoMetros) }) +
      (aprox
        ? " " + tr("Essa posição é aproximada (computador sem GPS ou VPN ligada). Faça o check-in pelo celular ou pelo QR do ponto.")
        : "")
    );
  }

  async function handleClick() {
    let pos: PosicaoGeo | null = null;
    try {
      pos = await obter();

      if (alvo) {
        const { dentro, distanciaMetros } = dentroDoRaio(pos, alvo);
        if (!dentro) {
          toast.error(
            tr("Você está a {distancia} do local. Chegue mais perto para fazer o check-in.", { distancia: formatarDistancia(distanciaMetros) }) + detalhePosicao(pos),
            { duration: 12000 },
          );
          return;
        }
      }

      setEnviando(true);
      await onConfirmar(pos);
    } catch (e) {
      if (e instanceof ErroGeo && e.estado === "negada") {
        toast.error(tr("Localização bloqueada. Toque no cadeado ao lado do endereço do site, permita a localização e tente de novo."));
      } else {
        const base = e instanceof Error ? tr(e.message) : tr("Não foi possível fazer o check-in.");
        toast.error(/Chegue mais perto/.test(base) ? base + detalhePosicao(pos) : base, { duration: 12000 });
      }
    } finally {
      setEnviando(false);
    }
  }

  const ocupado = carregando || enviando;

  return (
    <div className={cn("space-y-1", className)}>
      <Button type="button" className="w-full" disabled={disabled || ocupado} onClick={handleClick}>
        {ocupado ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MapPin className="mr-2 size-4" />}
        {carregando ? tr("Pegando localização…") : enviando ? tr("Registrando…") : rotulo}
      </Button>
      {permissao === "denied" && (
        <p className="text-xs text-destructive">{tr("A localização está bloqueada neste navegador. Libere nas permissões do site.")}</p>
      )}
    </div>
  );
}
