import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en";
import es from "./es";

export type Lang = "pt" | "en" | "es";
export const IDIOMAS: { id: Lang; curto: string; nome: string; locale: string }[] = [
  { id: "pt", curto: "PT", nome: "Português", locale: "pt-BR" },
  { id: "en", curto: "EN", nome: "English", locale: "en-US" },
  { id: "es", curto: "ES", nome: "Español", locale: "es-ES" },
];

const CHAVE = "alexandria-idioma";
const DICIONARIOS: Record<Lang, Record<string, string>> = { pt: {}, en, es };

// Idioma atual. É lido a cada chamada de tr(), então funciona em qualquer lugar do código.
let atual: Lang = "pt";

/**
 * Traduz um texto escrito em português. O próprio texto em português é a chave:
 * se não existir tradução, aparece o português (nada quebra).
 * Variáveis: tr("Olá, {nome}!", { nome: "Ana" }).
 */
// Mensagens que vêm prontas do servidor ou do banco podem ter números no meio
// ("Limite de 10 corretores..."). Para elas, o texto guardado usa {n} no lugar do número.
const modelos = new Map<Lang, { re: RegExp; chaves: string[]; destino: string }[]>();
function modelosDe(lang: Lang) {
  let l = modelos.get(lang);
  if (!l) {
    l = [];
    for (const [k, v] of Object.entries(DICIONARIOS[lang])) {
      if (!/\{\w+\}/.test(k) || k.replace(/\{\w+\}/g, "").length < 15) continue; // só textos longos, para não casar à toa
      const chaves: string[] = [];
      const re = new RegExp("^" + k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_, n) => { chaves.push(n); return "(.+?)"; }) + "$", "s");
      l.push({ re, chaves, destino: v });
    }
    modelos.set(lang, l);
  }
  return l;
}

export function tr(texto: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!texto) return texto;
  let base = texto;
  if (atual !== "pt") {
    const d = DICIONARIOS[atual][texto];
    if (d !== undefined) base = d;
    else if (!vars) {
      for (const m of modelosDe(atual)) {
        const r = m.re.exec(texto);
        if (r) {
          const achados: Record<string, string> = {};
          m.chaves.forEach((c, i) => (achados[c] = r[i + 1]));
          return m.destino.replace(/\{(\w+)\}/g, (x, c) => achados[c] ?? x);
        }
      }
    }
  }
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
}

/**
 * Texto com partes em destaque, traduzido de uma vez só (a ordem das palavras muda de idioma para idioma).
 * rich("O <b>master</b> cadastra os corretores.") — <b> e <i> já funcionam; para outras partes (links),
 * passe uma função por nome: rich("Veja <l>Meu plano</l>.", { l: (c) => <Link to="/meu-plano">{c}</Link> }).
 */
export function rich(texto: string, tags: Record<string, (filhos: ReactNode) => ReactNode> = {}, vars?: Record<string, string | number | null | undefined>): ReactNode {
  const base = tr(texto, vars);
  const todas: Record<string, (filhos: ReactNode) => ReactNode> = {
    b: (c) => <b>{c}</b>,
    i: (c) => <i>{c}</i>,
    ...tags,
  };
  const partes: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(base))) {
    if (m.index > ultimo) partes.push(base.slice(ultimo, m.index));
    const f = todas[m[1]];
    partes.push(f ? <Fragment key={n++}>{f(m[2])}</Fragment> : m[0]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < base.length) partes.push(base.slice(ultimo));
  return partes;
}

/** Marca um texto para tradução sem traduzir na hora (listas fixas no topo do arquivo). Use tr(valor) ao mostrar. */
export function mark<T extends string>(texto: T): T {
  return texto;
}

export function idiomaAtual(): Lang {
  return atual;
}

/** Ex.: "pt-BR", "en-US", "es-ES" — para datas e números. */
export function localeAtual(): string {
  return IDIOMAS.find((i) => i.id === atual)?.locale ?? "pt-BR";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "pt", setLang: () => {} });

export function useIdioma(): Ctx {
  return useContext(LangContext);
}

function lerSalvo(): Lang | null {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v === "en" || v === "es" || v === "pt" ? v : null;
  } catch {
    return null;
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");
  atual = lang;

  // Primeiro desenho é sempre em português (igual ao servidor); depois aplica a escolha salva.
  useEffect(() => {
    const salvo = lerSalvo();
    if (salvo && salvo !== "pt") {
      atual = salvo;
      setLangState(salvo);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = IDIOMAS.find((i) => i.id === lang)?.locale ?? "pt-BR";
  }, [lang]);

  const setLang = (l: Lang) => {
    atual = l;
    try {
      window.localStorage.setItem(CHAVE, l);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
    setLangState(l);
    // Guarda o idioma na conta (se logado) para os e-mails de acesso saírem no mesmo idioma.
    import("@/integrations/supabase/client")
      .then(({ supabase }) =>
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) return supabase.auth.updateUser({ data: { lang: l } });
        }),
      )
      .catch(() => {});
  };

  // key={lang}: ao trocar o idioma a tela é redesenhada inteira com os novos textos.
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangContext.Provider>
  );
}

export function SeletorIdioma({ className = "" }: { className?: string }) {
  const { lang, setLang } = useIdioma();
  return (
    <div className={`inline-flex items-center rounded-md border border-input text-xs ${className}`} role="group" aria-label="Language">
      {IDIOMAS.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => setLang(i.id)}
          aria-pressed={lang === i.id}
          title={i.nome}
          className={`px-2 py-1 font-medium first:rounded-l-md last:rounded-r-md ${
            lang === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {i.curto}
        </button>
      ))}
    </div>
  );
}
