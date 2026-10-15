import { useCallback, useEffect, useRef, useState } from "react";
import type { PosicaoGeo } from "@/lib/geo";

export type EstadoGeo = "ocioso" | "pedindo" | "ok" | "negada" | "indisponivel" | "erro";

export type PermissaoGeo = "desconhecida" | "granted" | "prompt" | "denied";

export class ErroGeo extends Error {
  constructor(
    public readonly estado: Exclude<EstadoGeo, "ocioso" | "pedindo" | "ok">,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroGeo";
  }
}

type Opcoes = {
  /** Tempo máximo esperando o GPS, em ms. Padrão 15 s. */
  timeoutMs?: number;
  /** Aceita uma posição em cache com até X ms. Padrão 0 (sempre posição nova). */
  idadeMaximaMs?: number;
  /** Pede GPS de alta precisão. Padrão true. */
  altaPrecisao?: boolean;
};

function lerPosicao(opcoes: Required<Opcoes>): Promise<PosicaoGeo> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new ErroGeo("indisponivel", "Este aparelho ou navegador não tem localização."));
      return;
    }
    if (!window.isSecureContext) {
      reject(new ErroGeo("indisponivel", "A localização só funciona em conexão segura (https)."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisaoMetros: p.coords.accuracy,
          capturadaEm: new Date(p.timestamp).toISOString(),
        }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          reject(new ErroGeo("negada", "Permissão de localização negada."));
        } else if (e.code === e.TIMEOUT) {
          reject(new ErroGeo("erro", "Não consegui pegar a localização a tempo. Tente de novo."));
        } else {
          reject(new ErroGeo("erro", "Não consegui descobrir onde você está."));
        }
      },
      {
        enableHighAccuracy: opcoes.altaPrecisao,
        timeout: opcoes.timeoutMs,
        maximumAge: opcoes.idadeMaximaMs,
      },
    );
  });
}

export function useGeolocalizacao(opcoes: Opcoes = {}) {
  const { timeoutMs = 15_000, idadeMaximaMs = 0, altaPrecisao = true } = opcoes;
  const [estado, setEstado] = useState<EstadoGeo>("ocioso");
  const [posicao, setPosicao] = useState<PosicaoGeo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [permissao, setPermissao] = useState<PermissaoGeo>("desconhecida");
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Descobre se o usuário já permitiu/negou, sem abrir o pedido na tela.
  useEffect(() => {
    let status: PermissionStatus | undefined;
    let cancelado = false;
    const atualizar = () => {
      if (status && !cancelado) setPermissao(status.state as PermissaoGeo);
    };
    try {
      navigator.permissions
        ?.query({ name: "geolocation" as PermissionName })
        .then((s) => {
          status = s;
          atualizar();
          s.addEventListener("change", atualizar);
        })
        .catch(() => {});
    } catch {
      /* navegador sem Permissions API: segue como "desconhecida" */
    }
    return () => {
      cancelado = true;
      status?.removeEventListener("change", atualizar);
    };
  }, []);

  /** Pede a localização agora. Lança ErroGeo se falhar. */
  const obter = useCallback(async (): Promise<PosicaoGeo> => {
    setEstado("pedindo");
    setErro(null);
    try {
      const pos = await lerPosicao({ timeoutMs, idadeMaximaMs, altaPrecisao });
      if (montado.current) {
        setPosicao(pos);
        setEstado("ok");
      }
      return pos;
    } catch (e) {
      const ge = e instanceof ErroGeo ? e : new ErroGeo("erro", "Falha ao obter a localização.");
      if (montado.current) {
        setEstado(ge.estado);
        setErro(ge.message);
      }
      throw ge;
    }
  }, [timeoutMs, idadeMaximaMs, altaPrecisao]);

  return { estado, posicao, erro, permissao, obter, carregando: estado === "pedindo" };
}
