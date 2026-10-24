// Lê o e-mail de aviso de lead dos portais (ZAP, VivaReal, OLX, Imovelweb, Chaves na Mão...) e tira nome, telefone,
// e-mail e mensagem. Os portais mudam o texto de tempos em tempos, então o leitor é flexível:
// procura linhas do tipo "Nome: Fulano", "Telefone: (11) 99999-9999", etc.

export type LeadEmail = {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  mensagem: string | null;
  anuncio: string | null;
  portal: string | null;
};

const PORTAIS: [RegExp, string][] = [
  [/vivareal/i, "VivaReal"],
  [/zapimoveis|zap\s*im[oó]veis|\bzap\b/i, "ZAP Imóveis"],
  [/olx/i, "OLX"],
  [/imovelweb/i, "Imovelweb"],
  [/chavesnam[aã]o|chaves na m[aã]o/i, "Chaves na Mão"],
  [/quintoandar/i, "QuintoAndar"],
];

export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>|<\/t[dh]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function campo(linhas: string[], rotulos: RegExp): string | null {
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(new RegExp("^\\s*(?:" + rotulos.source + ")\\s*[:\\-–]\\s*(.*)$", "i"));
    if (m) {
      const v = m[1].trim();
      if (v) return v;
      // valor na linha de baixo ("Nome:\nFulano")
      const prox = (linhas[i + 1] ?? "").trim();
      if (prox && !/^[\wÀ-ÿ .]{2,30}:\s*$/.test(prox)) return prox;
    }
  }
  return null;
}

export function lerLeadEmail(de: string, assunto: string, texto: string): LeadEmail {
  const corpo = /<\w+[^>]*>/.test(texto) ? htmlParaTexto(texto) : texto;
  const linhas = corpo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const nome = campo(linhas, /nome(?: completo)?|cliente|interessado|contato/);
  let telefone = campo(linhas, /telefone|celular|whatsapp|fone|tel\.?/);
  let email = campo(linhas, /e-?mail/);
  const mensagem = campo(linhas, /mensagem|coment[aá]rio|observa[cç][aã]o|recado/);
  const anuncio = campo(linhas, /c[oó]digo(?: do (?:an[uú]ncio|im[oó]vel))?|refer[eê]ncia|an[uú]ncio|im[oó]vel/);

  if (!telefone) {
    const m = corpo.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/);
    if (m) telefone = m[0].trim();
  }
  if (!email) {
    const todos = corpo.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    const proprio = de.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase();
    email = todos.find((e) => e.toLowerCase() !== proprio && !/noreply|no-reply|naoresponda/i.test(e)) ?? null;
  }
  if (telefone) {
    const dig = telefone.replace(/\D/g, "");
    telefone = dig.length >= 10 ? dig : null;
  }
  const alvo = `${de} ${assunto} ${corpo.slice(0, 600)}`;
  const portal = PORTAIS.find(([re]) => re.test(alvo))?.[1] ?? null;

  return { nome: nome ?? null, telefone, email: email ?? null, mensagem: mensagem ?? null, anuncio: anuncio ?? null, portal };
}
