import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGeolocalizacao, ErroGeo } from "@/hooks/use-geolocalizacao";
import { dentroDoRaio, formatarDistancia, type AlvoGeo, type PosicaoGeo } from "@/lib/geo";
import { cn } from "@/lib/utils";

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

export function CheckInButton({ onConfirmar, alvo, rotulo = "Fazer check-in", className, disabled }: Props) {
  const { obter, carregando, permissao } = useGeolocalizacao();
  const [enviando, setEnviando] = useState(false);

  async function handleClick() {
    try {
      const pos = await obter();

      if (alvo) {
        const { dentro, distanciaMetros } = dentroDoRaio(pos, alvo);
        if (!dentro) {
          toast.error(`Você está a ${formatarDistancia(distanciaMetros)} do local. Chegue mais perto para fazer o check-in.`);
          return;
        }
      }

      setEnviando(true);
      await onConfirmar(pos);
    } catch (e) {
      if (e instanceof ErroGeo && e.estado === "negada") {
        toast.error("Localização bloqueada. Toque no cadeado ao lado do endereço do site, permita a localização e tente de novo.");
      } else {
        toast.error(e instanceof Error ? e.message : "Não foi possível fazer o check-in.");
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
        {carregando ? "Pegando localização…" : enviando ? "Registrando…" : rotulo}
      </Button>
      {permissao === "denied" && (
        <p className="text-xs text-destructive">A localização está bloqueada neste navegador. Libere nas permissões do site.</p>
      )}
    </div>
  );
}
