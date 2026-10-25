// Lista textos em português que ainda não passam por tr()/mark().
const ts = require("typescript"), fs = require("fs"), path = require("path");
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src/routes", "src/components", "src/lib", "src/hooks"];
const SKIP_ATTR = new Set(["className","to","href","value","type","key","id","name","src","variant","size","htmlFor","side","align","inputMode","autoComplete","accept","target","rel","method","role","mode","orientation","position","defaultValue","width","height","viewBox","d","fill","stroke","style","asChild","kind"]);
const PT = /[À-ÿ]|\b(de|do|da|para|com|não|seu|sua|que|um|uma|os|as|por|em)\b/i;
function walk(d, a = []) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (/components[\\/]ui$|routes[\\/](api|lovable)$|email-templates|vendor/.test(p)) continue; walk(p, a);} else if (/\.tsx?$/.test(p) && !/routeTree|\.d\.ts/.test(p)) a.push(p);} return a; }
for (const root of roots) for (const file of fs.statSync(root).isDirectory() ? walk(root) : [root]) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const inTr = (n) => { for (let p = n.parent; p; p = p.parent) { if (ts.isCallExpression(p)) { const c = p.expression.getText(sf); if (c === "tr" || c === "mark") return true; } } return false; };
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) || ts.isJsxText(n)) {
      const p = n.parent;
      const text = ts.isJsxText(n) ? n.text.trim() : ts.isTemplateExpression(n) ? n.getText(sf) : n.text;
      let skip = !text || !/[A-Za-zÀ-ÿ]/.test(text);
      if (!skip && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || (ts.isPropertyAssignment(p) && p.name === n) || ts.isCaseClause(p))) skip = true;
      if (!skip && ts.isJsxAttribute(p) && SKIP_ATTR.has(p.name.getText(sf))) skip = true;
      if (!skip && ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) skip = true;
      if (!skip && ts.isElementAccessExpression(p)) skip = true;
      if (!skip && !PT.test(text) && !/\s/.test(text)) skip = true;
      if (!skip && /^[a-z_\-:./\[\]{}$#]+$/.test(text)) skip = true;
      if (!skip && /^(\/|https?:|\.\.?\/|@\/|[a-z]+\([^)]*\)$)/.test(text)) skip = true;
      if (!skip && !PT.test(text) && /^[A-Za-z0-9 _.\-:/,]+$/.test(text) && !/ /.test(text.trim())) skip = true;
      if (!skip && !inTr(n)) { const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf)); out.push(`${line + 1}: ${text.replace(/\s+/g, " ").slice(0, 110)}`); }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (out.length) console.log("== " + file + " (" + out.length + ")\n" + out.join("\n"));
}
