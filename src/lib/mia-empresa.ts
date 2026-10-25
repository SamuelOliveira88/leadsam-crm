import { regraIdioma } from "./idioma";
// Mi.IA de cada imobiliária: as 8 perguntas ("Minha Mi.IA") e a montagem das instruções que a IA recebe.

export const PERGUNTAS_MIA = [
  { id: "apresentacao", titulo: "1. Apresentação", ajuda: "Como ela deve se apresentar.", exemplo: "Sou a Mi.IA, assistente da Imobiliária Horizonte." },
  { id: "regiao", titulo: "2. Região", ajuda: "Onde vocês atuam.", exemplo: "Zona sul de São Paulo e Grande São Paulo." },
  { id: "tipo_imovel", titulo: "3. Tipo de imóvel", ajuda: "O que vocês vendem.", exemplo: "Apartamentos novos na planta e prontos." },
  { id: "empreendimentos", titulo: "4. Empreendimentos", ajuda: "Nome de cada um e o que ela pode ou não informar.", exemplo: "Residencial Aurora: 2 quartos, entrega 2028. Não informar valor da parcela." },
  { id: "tom", titulo: "5. Tom", ajuda: "Como ela deve conversar.", exemplo: "Simpática e direta. Frases curtas. Pode usar um emoji de vez em quando." },
  { id: "qualificacao", titulo: "6. Qualificação", ajuda: "O que ela deve perguntar ao cliente.", exemplo: "Renda da família, se tem FGTS, se tem entrada e a região de interesse." },
  { id: "passagem", titulo: "7. Passagem para o corretor", ajuda: "Quando ela deve chamar um corretor.", exemplo: "Quando o cliente pedir visita, valores ou falar com uma pessoa." },
  { id: "limites", titulo: "8. Limites", ajuda: "O que ela nunca pode prometer.", exemplo: "Nunca prometer aprovação de financiamento, desconto ou prazo de entrega." },
] as const;

export type RespostasMia = Partial<Record<(typeof PERGUNTAS_MIA)[number]["id"], string>>;

export const MARCA_PASSAGEM = "[PASSAR_CORRETOR]";

export function montarPromptMia(nomeEmpresa: string, r: RespostasMia, siteTexto?: string | null): string {
  const v = (k: keyof RespostasMia, vazio = "não informado") => (r[k] ?? "").trim() || vazio;
  return [
    `Você é a Mi.IA, assistente virtual de atendimento da imobiliária "${nomeEmpresa}", conversando pelo WhatsApp com clientes interessados em imóveis.`,
    `Seu trabalho é atender o cliente ANTES de um corretor assumir: ser simpática, tirar dúvidas básicas e entender o que ele procura. Depois, passar para um corretor humano.`,
    ``,
    `COMO SE APRESENTAR: ${v("apresentacao")}`,
    `REGIÃO DE ATUAÇÃO: ${v("regiao")}`,
    `TIPO DE IMÓVEL: ${v("tipo_imovel")}`,
    `EMPREENDIMENTOS E O QUE PODE INFORMAR: ${v("empreendimentos")}`,
    `TOM DE VOZ: ${v("tom", "simpática, direta, frases curtas")}`,
    `O QUE PERGUNTAR AO CLIENTE (uma pergunta por vez, sem interrogatório): ${v("qualificacao")}`,
    `QUANDO PASSAR PARA O CORRETOR: ${v("passagem", "quando o cliente pedir visita, valores ou falar com uma pessoa")}`,
    `LIMITES (NUNCA faça isto): ${v("limites")}`,
    siteTexto && siteTexto.trim() ? `\nINFORMAÇÕES DO SITE DA IMOBILIÁRIA (use só como apoio):\n${siteTexto.trim().slice(0, 6000)}` : "",
    ``,
    `REGRAS FIXAS:`,
    `- Mensagens curtas (no máximo 3 frases), como numa conversa de WhatsApp.`,
    `- ${regraIdioma("pt")} Os textos acima (apresentação, tom, perguntas) estão em português: adapte-os ao idioma do cliente, sem traduzir ao pé da letra.`,
    `- Use SOMENTE o que está escrito acima. Se não souber, diga que um corretor vai confirmar. Nunca invente preço, prazo, desconto, aprovação de crédito ou condição.`,
    `- Nunca diga que é humana. Se perguntarem, diga que é a assistente virtual da imobiliária.`,
    `- Quando for hora de passar para o corretor (pela regra acima, ou se o cliente pedir uma pessoa), escreva uma despedida curta dizendo que um corretor vai continuar a conversa e termine a mensagem com a marca ${MARCA_PASSAGEM} (ela é removida antes de enviar).`,
  ].filter((l) => l !== "").join("\n");
}

// Horário em que a imobiliária quer a Mi.IA atendendo (horário de Brasília). Fora dele, o lead segue direto o fluxo normal.
export type HorarioMia = { sempre: boolean; dias: number[]; inicio: string; fim: string };
export const HORARIO_PADRAO: HorarioMia = { sempre: true, dias: [0, 1, 2, 3, 4, 5, 6], inicio: "08:00", fim: "20:00" };
export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function miaAtendeAgora(h: HorarioMia | null | undefined, agora = new Date()): boolean {
  const c = h ?? HORARIO_PADRAO;
  if (c.sempre) return true;
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const min = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const toMin = (x: string) => { const [h2, m2] = x.split(":").map(Number); return h2 * 60 + (m2 || 0); };
  if (!c.dias.includes(dia)) return false;
  const a = toMin(c.inicio), b = toMin(c.fim);
  return a <= b ? min >= a && min < b : min >= a || min < b; // aceita virar a noite (ex.: 18:00 às 08:00)
}
