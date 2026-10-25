// Mantém os arquivos de idioma em dia.
//   node scripts/i18n.cjs extract   -> lista os textos em português achados no código (src/i18n/pt.ts)
//   node scripts/i18n.cjs check     -> confere se EN e ES têm todos os textos, sem sobra e com as mesmas {variáveis}
const ts = require("typescript"), fs = require("fs"), path = require("path");

function walk(d, a = []) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (/src[\\/]i18n$|components[\\/]ui$/.test(p)) continue; walk(p, a); }
    else if (/\.tsx?$/.test(p) && !/routeTree|\.d\.ts|types\.ts$/.test(p)) a.push(p);
  }
  return a;
}

function achar() {
  const chaves = new Map(); // texto -> origem
  const add = (t, o) => { if (t && !chaves.has(t)) chaves.set(t, o); };
  for (const file of walk("src")) {
    const src = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression.getText(sf);
        const a0 = n.arguments[0];
        if ((c === "tr" || c === "mark" || c === "rich") && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0))) add(a0.text, file);
      }
      if (ts.isNewExpression(n) && n.expression.getText(sf) === "Error" && n.arguments && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && /^src[\\/](lib|routes[\\/]api)/.test(file) && /[a-zà-ÿ]/i.test(n.arguments[0].text)) {
        add(n.arguments[0].text, file + " (servidor)");
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  // mensagens do banco (RAISE EXCEPTION '...'): % vira {n}
  const mig = "supabase/migrations";
  for (const f of fs.readdirSync(mig).sort()) {
    const s = fs.readFileSync(path.join(mig, f), "utf8");
    for (const m of s.matchAll(/RAISE EXCEPTION '((?:[^']|'')+)'/g)) {
      let t = m[1].replace(/''/g, "'");
      if (!/[a-zà-ÿ]/i.test(t) || /^[a-z_]+$/.test(t)) continue; // códigos internos
      let i = 0; t = t.replace(/%/g, () => (i++ ? "{n" + i + "}" : "{n}"));
      add(t, f + " (banco)");
    }
  }
  return chaves;
}

function lerDic(nome) {
  const p = `src/i18n/${nome}.ts`;
  const src = fs.readFileSync(p, "utf8");
  const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true);
  const out = new Map();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isNoSubstitutionTemplateLiteral(n.name)) && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) out.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const vars = (t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const q = (s) => JSON.stringify(s);

const modo = process.argv[2];
const achados = achar();
if (modo === "extract") {
  const linhas = [...achados.keys()].map((k) => `  ${q(k)}: ${q(k)},`);
  fs.writeFileSync("src/i18n/pt.ts", `// Todos os textos do Alexandria em português (idioma principal). Gerado por: node scripts/i18n.cjs extract\n// Não edite à mão: para mudar um texto, mude no código e rode o comando de novo.\nconst pt: Record<string, string> = {\n${linhas.join("\n")}\n};\nexport default pt;\n`);
  console.log(achados.size + " textos em src/i18n/pt.ts");
} else if (modo === "check") {
  let erros = 0;
  const pt = lerDic("pt");
  for (const k of achados.keys()) if (!pt.has(k)) { console.log("PT falta (rode extract):", k.slice(0, 80)); erros++; }
  for (const k of pt.keys()) if (!achados.has(k)) { console.log("PT sobra:", k.slice(0, 80)); erros++; }
  for (const lang of ["en", "es"]) {
    const d = lerDic(lang);
    for (const k of achados.keys()) {
      if (!d.has(k)) { console.log(`${lang.toUpperCase()} falta:`, k.slice(0, 90)); erros++; }
      else if (vars(d.get(k)) !== vars(k)) { console.log(`${lang.toUpperCase()} variáveis diferentes:`, k.slice(0, 90)); erros++; }
      else if (!d.get(k).trim()) { console.log(`${lang.toUpperCase()} vazio:`, k.slice(0, 90)); erros++; }
    }
    for (const k of d.keys()) if (!achados.has(k)) { console.log(`${lang.toUpperCase()} sobra:`, k.slice(0, 90)); erros++; }
  }
  console.log(erros ? erros + " problema(s)" : "Idiomas em dia: " + achados.size + " textos em PT, EN e ES.");
  process.exit(erros ? 1 : 0);
} else {
  console.log("Use: node scripts/i18n.cjs extract | check");
}
