// Ferramenta de uso único: envolve textos em português com tr("...") nas telas.
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const ATTRS = new Set(["placeholder", "title", "alt", "aria-label", "label", "description"]);
const LETTER = /[A-Za-zÀ-ÿ]/;

function jsxClean(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const last = lines.length - 1;
  const keep = [];
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, " ");
    if (i !== 0) l = l.replace(/^ +/, "");
    if (i !== last) l = l.replace(/ +$/, "");
    if (l) keep.push(l);
  });
  return keep.join(" ");
}

function processFile(file, write) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  let used = false;

  const isSimple = (n) => {
    if (ts.isIdentifier(n)) return true;
    if (ts.isNumericLiteral(n)) return true;
    if (ts.isNonNullExpression(n)) return isSimple(n.expression);
    if (ts.isPropertyAccessExpression(n)) return isSimple(n.expression);
    if (ts.isParenthesizedExpression(n)) return isSimple(n.expression);
    if (ts.isCallExpression(n)) return isSimple(n.expression) && n.arguments.every(isSimple);
    return false;
  };
  const nameOf = (n) => {
    if (ts.isNonNullExpression(n)) return nameOf(n.expression);
    if (ts.isPropertyAccessExpression(n)) return n.name.text;
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isCallExpression(n)) return nameOf(n.expression);
    return null;
  };

  function buildMessage(parts) {
    // parts: array of {kind:'text', s} | {kind:'expr', node}
    let msg = "";
    const vars = []; // {key, code}
    const byCode = new Map();
    const usedKeys = new Set();
    let n = 0;
    for (const p of parts) {
      if (p.kind === "text") msg += p.s;
      else {
        const code = p.node.getText(sf);
        let key = byCode.get(code);
        if (!key) {
          let base = nameOf(p.node);
          if (!base || !/^[A-Za-z_]\w*$/.test(base)) base = "v" + ++n;
          key = base;
          let i = 2;
          while (usedKeys.has(key)) key = base + i++;
          usedKeys.add(key);
          byCode.set(code, key);
          vars.push({ key, code });
        }
        msg += "{" + key + "}";
      }
    }
    return { msg, vars };
  }
  function callCode(msg, vars) {
    let s = "tr(" + JSON.stringify(msg);
    if (vars.length) s += ", { " + vars.map((v) => (v.key === v.code ? v.key : v.key + ": " + v.code)).join(", ") + " }";
    return s + ")";
  }

  function wrapString(node) {
    // StringLiteral | NoSubstitutionTemplateLiteral | TemplateExpression
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!LETTER.test(node.text)) return;
      edits.push([node.getStart(sf), node.end, callCode(node.text, [])]);
      used = true;
    } else if (ts.isTemplateExpression(node)) {
      const parts = [{ kind: "text", s: node.head.text }];
      for (const sp of node.templateSpans) {
        parts.push({ kind: "expr", node: sp.expression });
        parts.push({ kind: "text", s: sp.literal.text });
      }
      const texts = parts.filter((p) => p.kind === "text").map((p) => p.s).join("");
      if (!LETTER.test(texts)) return;
      const { msg, vars } = buildMessage(parts);
      edits.push([node.getStart(sf), node.end, callCode(msg, vars)]);
      used = true;
    }
  }
  const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);

  // Procura strings dentro de uma expressão (ternário, ||, ??, &&)
  function exprStrings(n, depth = 0) {
    if (isStr(n)) return wrapString(n);
    if (ts.isParenthesizedExpression(n)) return exprStrings(n.expression);
    if (ts.isConditionalExpression(n)) { exprStrings(n.whenTrue); exprStrings(n.whenFalse); return; }
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (k !== ts.SyntaxKind.AmpersandAmpersandToken) exprStrings(n.left);
        exprStrings(n.right);
      }
      return;
    }
  }
  const isMessageAccess = (n) =>
    (ts.isPropertyAccessExpression(n) && n.name.text === "message");

  function toastArg(n) {
    if (isMessageAccess(n)) { edits.push([n.getStart(sf), n.end, "tr(" + n.getText(sf) + ")"]); used = true; return; }
    if (isStr(n)) return wrapString(n);
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
        if (isMessageAccess(n.left)) { edits.push([n.left.getStart(sf), n.left.end, "tr(" + n.left.getText(sf) + ")"]); used = true; }
        else exprStrings(n.left);
        exprStrings(n.right);
      }
    }
    if (ts.isConditionalExpression(n)) exprStrings(n);
  }

  function processChildren(children) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const nodes = run; run = [];
      const parts = [];
      let hasLetters = false;
      for (const nd of nodes) {
        if (ts.isJsxText(nd)) {
          const s = jsxClean(nd.text);
          if (LETTER.test(s)) hasLetters = true;
          parts.push({ kind: "text", s });
        } else {
          const e = nd.expression;
          if (e && ts.isStringLiteral(e) && /^\s*$/.test(e.text)) parts.push({ kind: "text", s: e.text });
          else parts.push({ kind: "expr", node: e });
        }
      }
      if (!hasLetters) return;
      const first = nodes[0], lastN = nodes[nodes.length - 1];
      const start = ts.isJsxText(first) ? first.pos : first.getStart(sf);
      const end = lastN.end;
      const { msg: raw, vars } = buildMessage(parts);
      // espaços das pontas ficam fora do tr()
      const lead = /^ /.test(raw), trail = / $/.test(raw);
      const msg = raw.trim();
      if (!LETTER.test(msg.replace(/\{\w+\}/g, ""))) return;
      edits.push([start, end, (lead ? " " : "") + "{" + callCode(msg, vars) + "}" + (trail ? " " : "")]);
      used = true;
    };
    for (const ch of children) {
      if (ts.isJsxText(ch)) { run.push(ch); continue; }
      if (ts.isJsxExpression(ch)) {
        const e = ch.expression;
        if (!e) { flush(); continue; } // comentário
        if (ts.isStringLiteral(e) && /^\s*$/.test(e.text)) { run.push(ch); continue; }
        if (isSimple(e)) { run.push(ch); continue; }
        flush();
        exprStrings(e); // ternários etc.
        continue;
      }
      flush();
    }
    flush();
  }

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) processChildren(node.children);
    if (ts.isJsxAttribute(node) && node.initializer) {
      const nm = node.name.getText(sf);
      if (ATTRS.has(nm)) {
        if (ts.isStringLiteral(node.initializer) && LETTER.test(node.initializer.text)) {
          edits.push([node.initializer.getStart(sf), node.initializer.end, "{" + callCode(node.initializer.text, []) + "}"]);
          used = true;
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          exprStrings(node.initializer.expression);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (/^toast(\.(error|success|info|warning|message|loading))?$/.test(callee) && node.arguments[0]) toastArg(node.arguments[0]);
      else if (/^(window\.)?(confirm|alert)$/.test(callee) && node.arguments[0]) { if (isStr(node.arguments[0])) wrapString(node.arguments[0]); }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!edits.length) return 0;

  // evita sobreposição: ordena e descarta edições aninhadas
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const clean = [];
  let lastEnd = -1;
  for (const e of edits) { if (e[0] >= lastEnd) { clean.push(e); lastEnd = e[1]; } }
  let out = src;
  for (const [s, e, r] of clean.reverse()) out = out.slice(0, s) + r + out.slice(e);

  if (!/from "@\/i18n"/.test(out)) {
    const imps = [...out.matchAll(/^import[\s\S]*?;\s*$/gm)];
    const lastImp = imps[imps.length - 1];
    const at = lastImp.index + lastImp[0].length;
    out = out.slice(0, at) + '\nimport { tr } from "@/i18n";' + out.slice(at);
  }
  if (write) fs.writeFileSync(file, out);
  return clean.length;
}

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (/src[\\/]routes[\\/](api|lovable)$/.test(p) || /components[\\/]ui$/.test(p)) continue;
      walk(p, acc);
    } else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}
const write = process.argv.includes("--write");
const files = [...walk("src/routes"), ...walk("src/components"), ...walk("src/hooks")].filter((f) => !f.endsWith("routeTree.gen.ts"));
let total = 0;
for (const f of files) { const n = processFile(f, write); if (n) { console.log(n, f); total += n; } }
console.log("total", total);
