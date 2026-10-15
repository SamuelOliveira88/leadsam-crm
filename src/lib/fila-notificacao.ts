// Regras de repetição dos avisos de WhatsApp (puro, sem banco, fácil de testar).

export const MAX_TENTATIVAS = 6;
/** Espera antes da próxima tentativa, em minutos (1ª falha, 2ª falha, ...). */
export const ESPERA_MINUTOS = [1, 2, 5, 10, 20, 30] as const;
/** Depois disso o aviso perde a utilidade e é descartado como "expirado". */
export const VALIDADE_HORAS = 12;
export const ESPERA_ADIAR_MINUTOS = 5;

/**
 * adiar          — não é falha: notificações pausadas ou fora do horário. Continua na fila.
 * definitivo     — repetir não adianta (sem corretor, sem telefone, número inexistente).
 * tentar_de_novo — falha passageira (Evolution fora do ar, rede, erro 5xx).
 */
export type MotivoFalha = "adiar" | "definitivo" | "tentar_de_novo";

export type Decisao = {
  status: "pendente" | "erro" | "expirado";
  tentativas: number;
  proxima: Date;
  erro: string | null;
};

export function decidirAposFalha(p: {
  motivo: MotivoFalha;
  erro?: string | null;
  tentativas: number;
  criadoEm: Date;
  agora: Date;
}): Decisao {
  const { motivo, tentativas, criadoEm, agora } = p;
  const erro = p.erro ?? null;
  const minutos = (n: number) => new Date(agora.getTime() + n * 60_000);

  if (agora.getTime() - criadoEm.getTime() > VALIDADE_HORAS * 3_600_000) {
    return { status: "expirado", tentativas, proxima: agora, erro: erro ?? "Aviso expirado" };
  }
  if (motivo === "adiar") {
    return { status: "pendente", tentativas, proxima: minutos(ESPERA_ADIAR_MINUTOS), erro };
  }
  if (motivo === "definitivo") {
    return { status: "erro", tentativas: tentativas + 1, proxima: agora, erro };
  }
  const novas = tentativas + 1;
  if (novas >= MAX_TENTATIVAS) return { status: "erro", tentativas: novas, proxima: agora, erro };
  return { status: "pendente", tentativas: novas, proxima: minutos(ESPERA_MINUTOS[Math.min(tentativas, ESPERA_MINUTOS.length - 1)]), erro };
}
