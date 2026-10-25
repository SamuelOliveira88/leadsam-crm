// Idiomas atendidos pela Mi.IA (português do Brasil, inglês e espanhol).
// A Mi.IA responde no idioma em que a pessoa escreve. Aqui ficam só as frases fixas do servidor
// e um detector simples de idioma, usado quando o servidor precisa escrever uma frase sozinho.

export type Idioma = "pt" | "en" | "es";

export const idiomaValido = (v: unknown): v is Idioma => v === "pt" || v === "en" || v === "es";

const NOME: Record<Idioma, string> = { pt: "português do Brasil", en: "inglês", es: "espanhol" };

// Palavras comuns e que quase não aparecem nos outros dois idiomas.
const PALAVRAS: Record<Idioma, string[]> = {
  pt: ["você", "voce", "não", "nao", "obrigado", "obrigada", "oi", "olá", "ola", "quero", "preço", "quanto", "tudo", "bom", "dia", "tarde", "noite", "apartamento", "casa", "imóvel", "imovel", "gostaria", "sim", "uma", "com", "para", "está", "esta", "preciso", "tenho", "queria", "valor", "valores", "visita"],
  en: ["the", "you", "and", "hello", "hi", "hey", "thanks", "thank", "please", "want", "price", "how", "much", "what", "is", "are", "do", "does", "can", "could", "would", "looking", "apartment", "house", "property", "interested", "yes", "no", "with", "for", "i", "i'm", "my", "need", "have", "visit", "tour"],
  es: ["usted", "tú", "tu", "hola", "gracias", "por", "favor", "quiero", "precio", "cuánto", "cuanto", "cuesta", "qué", "que", "buenas", "buenos", "días", "dias", "tardes", "noches", "apartamento", "departamento", "casa", "propiedad", "inmueble", "busco", "necesito", "tengo", "quisiera", "sí", "si", "con", "para", "una", "el", "los", "las", "visita", "estoy", "puedo"],
};

// Devolve o idioma mais provável do texto. Em caso de empate ou texto sem pistas, devolve o padrão.
export function detectarIdioma(texto: string, padrao: Idioma = "pt"): Idioma {
  const palavras = texto.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (!palavras.length) return padrao;
  const pontos: Record<Idioma, number> = { pt: 0, en: 0, es: 0 };
  for (const p of palavras) for (const l of ["pt", "en", "es"] as Idioma[]) if (PALAVRAS[l].includes(p)) pontos[l]++;
  let melhor: Idioma = padrao, max = pontos[padrao];
  for (const l of ["pt", "en", "es"] as Idioma[]) if (pontos[l] > max) { melhor = l; max = pontos[l]; }
  return melhor;
}

// Regra de idioma que entra em todo prompt da Mi.IA.
export function regraIdioma(padrao: Idioma = "pt"): string {
  return `IDIOMA: responda sempre no idioma em que a pessoa escrever (português do Brasil, inglês ou espanhol). Se ela mudar de idioma no meio da conversa, mude junto. Nunca peça para a pessoa escolher o idioma. Se a mensagem não der pista (por exemplo só "ok" ou um número), use ${NOME[padrao]}. Escreva como um falante nativo daquele idioma, de forma natural, sem cara de tradução: mesmo tom simples, direto e simpático, de conversa rápida, trocando gírias por equivalentes naturais do idioma. Não traduza os nomes Mi.IA, Mi Zap, Mi Central e Alexandria. Valores sempre em reais (R$), sem converter para outra moeda.`;
}

export const FRASE_PASSAGEM: Record<Idioma, string> = {
  pt: "Vou chamar um dos nossos corretores para continuar com você. Já já ele te responde por aqui 😊",
  en: "I'll bring in one of our agents to continue with you. They'll reply right here in a moment 😊",
  es: "Voy a llamar a uno de nuestros asesores para que siga contigo. En un momento te responde por aquí 😊",
};

// Mensagem enviada ao WhatsApp de quem pediu o teste pela página de vendas.
export function mensagemConvite(idioma: Idioma, primeiro: string, link: string, codigo: string): string {
  if (idioma === "en")
    return `Hi, ${primeiro}! This is Mi.IA from Alexandria Leads 👋\n\nHere's your invitation to try it *free for 7 days*:\n${link}\n\nJust open it, create your account and enter your agency's name. Your invitation code is *${codigo}* (valid for 7 days). Any questions, just reply here.`;
  if (idioma === "es")
    return `¡Hola, ${primeiro}! Soy Mi.IA, de Alexandria Leads 👋\n\nAquí está tu invitación para probar *7 días gratis*:\n${link}\n\nSolo ábrela, crea tu cuenta y escribe el nombre de tu inmobiliaria. Tu código de invitación es *${codigo}* (vale por 7 días). Si tienes cualquier duda, responde aquí.`;
  return `Oi, ${primeiro}! Aqui é a Mi.IA do Alexandria Leads 👋\n\nSeu convite para testar *7 dias grátis*:\n${link}\n\nÉ só abrir, criar sua conta e dar o nome da sua imobiliária. O código do convite é *${codigo}* (vale por 7 dias). Qualquer dúvida, é só responder aqui.`;
}
