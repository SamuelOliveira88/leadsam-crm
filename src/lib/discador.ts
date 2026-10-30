// Regras do discador (puras, sem código de servidor). Usadas pela tela e pelo servidor.

export const ESTADOS_DISCADOR = ["offline", "pronto", "pausa", "preenchendo", "ocupado"] as const;
export type EstadoDiscador = (typeof ESTADOS_DISCADOR)[number];

/** Estados que o corretor escolhe sozinho. "ocupado" e "preenchendo" o sistema coloca. */
export const ESTADOS_ESCOLHIDOS = ["pronto", "pausa", "offline"] as const;

export const RESULTADOS_DISCADOR = [
  { id: "atendeu", rotulo: "Atendeu" },
  { id: "nao_atendeu", rotulo: "Não atendeu" },
  { id: "caixa_postal", rotulo: "Caixa postal" },
  { id: "numero_errado", rotulo: "Número errado" },
  { id: "ligar_depois", rotulo: "Pediu para ligar depois" },
  { id: "nao_ligar_mais", rotulo: "Não ligar mais" },
] as const;
export type ResultadoDiscador = (typeof RESULTADOS_DISCADOR)[number]["id"];

/** Limites contra spam e contra número marcado pela operadora. Ajuste aqui. */
export const LIMITES_DISCADOR = {
  tentativasPorLead24h: 2,
  /** Dias úteis (seg=1 ... sex=5), horário de Brasília. */
  horaInicio: 9,
  horaFim: 18,
  diasPermitidos: [1, 2, 3, 4, 5],
  /** Chamada que ficou sem resposta da ponte por mais que isso é considerada morta. */
  chamadaMortaMin: 10,
} as const;

/** Só números brasileiros: DDD + 8 ou 9 dígitos. Devolve só os dígitos, sem 55 nem 0. */
export function normalizarTelefoneBR(telefone: string | null | undefined): string | null {
  let d = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") return d; // celular
  if (d.length === 10 && /[2-5]/.test(d[2])) return d; // fixo
  return null;
}

/** Está dentro do horário em que o discador pode ligar? (relógio de Brasília) */
export function dentroDoHorario(agora = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.find((p) => p.type === "weekday")?.value ?? "");
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0") % 24;
  return (LIMITES_DISCADOR.diasPermitidos as readonly number[]).includes(dia) && hora >= LIMITES_DISCADOR.horaInicio && hora < LIMITES_DISCADOR.horaFim;
}

export function notaChamadaDiscador(resultadoRotulo: string, duracaoSeg?: number | null): string {
  const dur = duracaoSeg ? ` (${Math.floor(duracaoSeg / 60)}min ${duracaoSeg % 60}s)` : "";
  return `📞 Discador: ${resultadoRotulo}${dur}`;
}
