/* Troca de idioma (PT, EN, ES) das páginas públicas.
   Uso: <script src="/i18n.js" data-base="/pasta/i18n/"></script> no fim da página.
   - Textos: elementos com data-i18n="chave" (o texto em português fica no HTML como padrão).
   - Textos com <b>/<code>: data-i18n-html="chave" (só para textos escritos por nós nos arquivos de idioma).
   - Atributos: data-i18n-attr="atributo:chave;outro:chave".
   - Links do WhatsApp: data-wa (o texto da mensagem vem da chave "wa.texto").
   - Um arquivo por idioma em <data-base>pt.json, en.json, es.json.
   A escolha fica salva neste navegador (chave "idioma"). */
(function () {
  var LANGS = [["pt", "PT", "pt-BR"], ["en", "EN", "en"], ["es", "ES", "es"]];
  var KEY = "idioma";
  var sc = document.currentScript;
  var base = (sc && sc.getAttribute("data-base")) || "/i18n/";
  var cache = {}, dict = {}, cur = "pt";

  function valido(l) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === l) return true; return false; }
  function salvo() { try { var v = localStorage.getItem(KEY); return valido(v) ? v : null; } catch (e) { return null; } }
  function guardar(l) { try { localStorage.setItem(KEY, l); } catch (e) {} }
  function palpite() { var n = String(navigator.language || "pt").slice(0, 2).toLowerCase(); return n === "en" || n === "es" ? n : "pt"; }

  function carregar(l, cb) {
    if (cache[l]) return cb(cache[l]);
    fetch(base + l + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); })
      .then(function (j) { cache[l] = j; cb(j); }).catch(function () { cb(null); });
  }

  function aplicar() {
    var i, el, nodes;
    nodes = document.querySelectorAll("[data-i18n]");
    for (i = 0; i < nodes.length; i++) { el = nodes[i]; var v = dict[el.getAttribute("data-i18n")]; if (typeof v === "string") el.textContent = v; }
    nodes = document.querySelectorAll("[data-i18n-html]");
    for (i = 0; i < nodes.length; i++) { el = nodes[i]; var h = dict[el.getAttribute("data-i18n-html")]; if (typeof h === "string") el.innerHTML = h; } // textos próprios com <b> e <code>
    nodes = document.querySelectorAll("[data-i18n-attr]");
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      el.getAttribute("data-i18n-attr").split(";").forEach(function (par) {
        var p = par.split(":"); var t = dict[p[1]]; if (p[0] && typeof t === "string") el.setAttribute(p[0], t);
      });
    }
    nodes = document.querySelectorAll("[data-wa]");
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (!el.getAttribute("data-wa-base")) el.setAttribute("data-wa-base", el.getAttribute("href").split("?")[0]);
      if (typeof dict["wa.texto"] === "string") el.setAttribute("href", el.getAttribute("data-wa-base") + "?text=" + encodeURIComponent(dict["wa.texto"]));
    }
    for (i = 0; i < LANGS.length; i++) if (LANGS[i][0] === cur) document.documentElement.lang = LANGS[i][2];
    var bs = document.querySelectorAll("#idiomas button");
    for (i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-l") === cur ? "true" : "false");
    var box = document.getElementById("idiomas");
    if (box && typeof dict["aria.idioma"] === "string") box.setAttribute("aria-label", dict["aria.idioma"]);
    document.dispatchEvent(new CustomEvent("idioma", { detail: cur }));
  }

  function definir(l, guardarEscolha) {
    if (!valido(l)) l = "pt";
    carregar(l, function (j) {
      if (!j) return;           // sem arquivo: continua no idioma atual
      cur = l; dict = j;
      if (guardarEscolha) guardar(l);
      aplicar();
    });
  }

  function montarBotoes() {
    var box = document.getElementById("idiomas");
    if (!box) return;
    box.setAttribute("role", "group");
    LANGS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = l[1]; b.setAttribute("data-l", l[0]);
      b.onclick = function () { definir(l[0], true); };
      box.appendChild(b);
    });
  }

  window.I18N = {
    t: function (k, fallback) { return typeof dict[k] === "string" || typeof dict[k] === "object" ? dict[k] : fallback; },
    lang: function () { return cur; },
    set: function (l) { definir(l, true); }
  };
  montarBotoes();
  definir(salvo() || palpite(), false);
})();
