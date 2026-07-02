export const ESTAGIO_LABELS: Record<string, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

export const ESTAGIOS_ORDEM = ["novo", "em_contato", "proposta", "fechado", "perdido"] as const;
export type Estagio = (typeof ESTAGIOS_ORDEM)[number];

export const ESTAGIO_COLORS: Record<string, string> = {
  novo: "bg-primary-soft text-primary",
  em_contato: "bg-accent/20 text-accent-foreground",
  proposta: "bg-warning/20 text-warning-foreground",
  fechado: "bg-success/15 text-success",
  perdido: "bg-destructive/10 text-destructive",
};

export function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}
