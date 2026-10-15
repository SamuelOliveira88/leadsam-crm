// Agenda de compromissos — tipos, rótulos, datas no fuso de São Paulo e texto do lembrete.
// O Brasil não usa horário de verão desde 2019, então São Paulo é sempre UTC-03:00.

export const TIPOS_COMPROMISSO = ["visita", "ligacao", "reuniao"] as const;
export type TipoCompromisso = (typeof TIPOS_COMPROMISSO)[number];

export const STATUS_COMPROMISSO = ["agendado", "realizado", "cancelado", "nao_compareceu"] as const;
export type StatusCompromisso = (typeof STATUS_COMPROMISSO)[number];

export const ROTULO_TIPO: Record<TipoCompromisso, string> = {
  visita: "Visita",
  ligacao: "Ligação",
  reuniao: "Reunião",
};

export const ROTULO_STATUS: Record<StatusCompromisso, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

const TZ = "America/Sao_Paulo";
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data de hoje em São Paulo, como "AAAA-MM-DD". */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function somarDias(ymd: string, n: number): string {
  const [a, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contém a data. */
export function inicioDaSemana(ymd: string): string {
  const [a, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return somarDias(ymd, dow === 0 ? -6 : 1 - dow);
}

/** Início do dia (00:00 de São Paulo) como instante ISO. */
export function inicioDoDiaISO(ymd: string): string {
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

/** Converte o valor de <input type="datetime-local"> (hora de SP) em instante ISO. */
export function inputLocalParaISO(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Converte um instante ISO no formato de <input type="datetime-local"> (hora de SP). */
export function isoParaInputLocal(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  const hora = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hora}:${g("minute")}`;
}

export function diaSP(iso: string): string {
  return hojeSP(new Date(iso));
}

export function horaSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function rotuloDia(ymd: string): string {
  const [a, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS_CURTOS[dow]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function mensagemLembrete(p: {
  tipo: string;
  leadNome?: string | null;
  leadTelefone?: string | null;
  empreendimento?: string | null;
  dataHora: string;
  observacoes?: string | null;
  agora?: Date;
}): string {
  const agora = p.agora ?? new Date();
  const faltam = Math.max(0, Math.round((new Date(p.dataHora).getTime() - agora.getTime()) / 60_000));
  const rotulo = (ROTULO_TIPO as Record<string, string>)[p.tipo] ?? "Compromisso";
  const quando = faltam <= 1 ? "agora" : faltam >= 90 ? `em ${Math.round(faltam / 60)} h` : `em ${faltam} min`;
  const linhas = [
    `⏰ *Lembrete: ${rotulo.toLowerCase()} ${quando} — Alexandria Leds*`,
    p.leadNome ? `Cliente: ${p.leadNome}` : null,
    p.leadTelefone ? `Telefone: ${p.leadTelefone}` : null,
    p.empreendimento ? `Empreendimento: ${p.empreendimento}` : null,
    `Horário: ${horaSP(p.dataHora)}`,
    p.observacoes ? `Obs: ${String(p.observacoes).trim().slice(0, 300)}` : null,
  ].filter(Boolean);
  return linhas.join("\n");
}
