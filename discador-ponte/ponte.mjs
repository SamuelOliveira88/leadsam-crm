#!/usr/bin/env node
// Ponte do discador: fica na VPS, ao lado do Asterisk.
//  - De 1,5 em 1,5 segundo pergunta ao Alexandria: "tem ligação pedida? tem ramal novo?"
//  - Faz a ligação pela ARI do Asterisk (que só aceita conexões de dentro da VPS)
//  - Avisa o Alexandria quando o cliente atende e quando a ligação termina
// Só conexões de DENTRO para FORA: nenhuma porta nova precisa ser aberta.
// Precisa de Node 22 ou mais novo (usa o WebSocket e o fetch que já vêm nele). Sem dependências.

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const env = (nome, padrao) => {
  const v = process.env[nome] ?? padrao;
  if (v === undefined || v === "") {
    console.error(`Falta a variável ${nome}. Veja o arquivo .env.example`);
    process.exit(1);
  }
  return v;
};

const ALEXANDRIA_URL = env("ALEXANDRIA_URL").replace(/\/$/, "");
const TOKEN = env("DISCADOR_PONTE_TOKEN");
const ARI_URL = env("ARI_URL", "http://127.0.0.1:8088");
const ARI_USER = env("ARI_USER", "alexandria");
const ARI_SENHA = env("ARI_SENHA");
const ARI_APP = env("ARI_APP", "alexandria");
// Como o Asterisk liga para o cliente. {numero} vira DDD+telefone. Ex.: PJSIP/{numero}@trunk-operadora
const TRONCO = env("TRONCO", "PJSIP/{numero}@trunk-operadora");
const CALLER_ID = process.env.CALLER_ID ?? ""; // número que aparece para o cliente (opcional)
const RAMAIS_CONF = env("RAMAIS_CONF", "/etc/asterisk/pjsip_ramais.conf");
const PASTA_GRAVACAO = env("PASTA_GRAVACAO", "/var/spool/asterisk/recording");
const INTERVALO_MS = Number(env("INTERVALO_MS", "1500"));
const TEMPO_TOQUE_CLIENTE = Number(env("TEMPO_TOQUE_CLIENTE", "30"));
const TEMPO_TOQUE_CORRETOR = Number(env("TEMPO_TOQUE_CORRETOR", "15"));

const log = (nivel, evento, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...extra }));

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const basic = "Basic " + Buffer.from(`${ARI_USER}:${ARI_SENHA}`).toString("base64");

// ---------- Alexandria ----------
async function alexandria(corpo) {
  const r = await fetch(`${ALEXANDRIA_URL}/api/public/discador-ponte`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ponte-token": TOKEN },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Alexandria respondeu ${r.status}`);
  return r.json();
}

// Manda o aviso com novas tentativas (se a internet falhar, não perde o fim da ligação).
async function avisar(corpo) {
  for (let i = 0; i < 6; i++) {
    try {
      await alexandria({ acao: "evento", ...corpo });
      return;
    } catch (e) {
      log("aviso", "aviso_falhou", { tentativa: i + 1, erro: String(e), id: corpo.id });
      await pausa(Math.min(30_000, 1000 * 2 ** i));
    }
  }
  log("erro", "aviso_perdido", { id: corpo.id, tipo: corpo.tipo });
}

// ---------- ARI ----------
async function ari(metodo, caminho, params = {}) {
  const url = new URL(`${ARI_URL}/ari${caminho}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const r = await fetch(url, { method: metodo, headers: { authorization: basic }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ARI ${metodo} ${caminho} -> ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}

// ---------- Chamadas em andamento ----------
// id da chamada -> { id, ramal, atendidaEm, agenteEntrou, finalizada, bridgeId }
const chamadas = new Map();
const idLead = (id) => `lead-${id}`;
const idAgente = (id) => `agente-${id}`;
const idPonte = (id) => `ponte-${id}`;

async function iniciarChamada(pedido) {
  const { id, telefone, ramal } = pedido;
  const c = { id, ramal, atendidaEm: null, agenteEntrou: false, finalizada: false };
  chamadas.set(id, c);
  log("info", "discando", { id, ramal });
  try {
    await ari("POST", "/channels", {
      endpoint: TRONCO.replace("{numero}", telefone),
      app: ARI_APP,
      appArgs: `lead,${id}`,
      channelId: idLead(id),
      callerId: CALLER_ID,
      timeout: TEMPO_TOQUE_CLIENTE,
      formats: "ulaw,alaw",
    });
  } catch (e) {
    log("erro", "originate_falhou", { id, erro: String(e) });
    await finalizar(c, "falhou", { motivo: "Não consegui completar a ligação (linha da operadora)." });
  }
}

async function finalizar(c, tipo, extra = {}) {
  if (c.finalizada) return;
  c.finalizada = true;
  chamadas.delete(c.id);
  const duracao = c.atendidaEm ? Math.round((Date.now() - c.atendidaEm) / 1000) : undefined;
  // Derruba o que ainda estiver de pé e fecha a gravação.
  await ari("DELETE", `/channels/${idAgente(c.id)}`).catch(() => {});
  await ari("DELETE", `/channels/${idLead(c.id)}`).catch(() => {});
  if (c.agenteEntrou) await ari("POST", `/recordings/live/rec-${c.id}/stop`).catch(() => {});
  await ari("DELETE", `/bridges/${idPonte(c.id)}`).catch(() => {});
  const gravacao = c.agenteEntrou ? `${PASTA_GRAVACAO}/rec-${c.id}.wav` : undefined;
  log("info", "finalizada", { id: c.id, tipo, duracao, ...extra });
  await avisar({ id: c.id, tipo, duracao_seg: duracao, gravacao_path: gravacao, ...extra });
}

const MOTIVOS = {
  17: "Ocupado",
  18: "Sem resposta",
  19: "Não atendeu",
  21: "Chamada recusada",
  1: "Número inexistente",
  22: "Número mudou",
  28: "Número inválido",
  34: "Operadora sem canal livre",
  38: "Rede fora do ar",
};

async function aoEvento(ev) {
  const canalId = ev.channel?.id ?? "";
  const m = /^(lead|agente)-(.+)$/.exec(canalId);
  if (!m) return;
  const [, papel, id] = m;
  const c = chamadas.get(id);
  if (!c) return;

  if (ev.type === "StasisStart" && papel === "lead") {
    // O cliente atendeu. Segura na espera e chama o corretor (o telefone do navegador atende sozinho).
    c.atendidaEm = Date.now();
    log("info", "cliente_atendeu", { id });
    avisar({ id, tipo: "atendida" });
    try {
      await ari("POST", "/bridges", { type: "mixing", bridgeId: idPonte(id), name: idPonte(id) });
      await ari("POST", `/bridges/${idPonte(id)}/addChannel`, { channel: idLead(id) });
      await ari("POST", `/bridges/${idPonte(id)}/moh`, { mohClass: "default" }).catch(() => {});
      await ari("POST", "/channels", {
        endpoint: `PJSIP/${c.ramal}`,
        app: ARI_APP,
        appArgs: `agente,${id}`,
        channelId: idAgente(id),
        timeout: TEMPO_TOQUE_CORRETOR,
        callerId: CALLER_ID,
      });
    } catch (e) {
      log("erro", "chamar_corretor_falhou", { id, erro: String(e) });
      await finalizar(c, "falhou", { motivo: "Não consegui chamar o telefone do corretor." });
    }
    return;
  }

  if (ev.type === "StasisStart" && papel === "agente") {
    // Corretor na linha: junta com o cliente e começa a gravar a conversa.
    try {
      await ari("DELETE", `/bridges/${idPonte(id)}/moh`).catch(() => {});
      await ari("POST", `/bridges/${idPonte(id)}/addChannel`, { channel: idAgente(id) });
      await ari("POST", `/bridges/${idPonte(id)}/record`, {
        name: `rec-${id}`,
        format: "wav",
        ifExists: "overwrite",
        beep: "false",
      });
      c.agenteEntrou = true;
      log("info", "corretor_na_linha", { id });
    } catch (e) {
      log("erro", "juntar_falhou", { id, erro: String(e) });
      await finalizar(c, "falhou", { motivo: "Falha ao conectar você ao cliente." });
    }
    return;
  }

  if (ev.type === "ChannelDestroyed" || ev.type === "StasisEnd") {
    if (ev.type === "StasisEnd" && papel === "agente" && !c.agenteEntrou) return;
    if (papel === "lead" && !c.atendidaEm) {
      // Nunca atendeu: toca, ocupado, recusou...
      const motivo = MOTIVOS[ev.cause] ?? ev.cause_txt ?? "Não completou";
      return finalizar(c, "falhou", { motivo });
    }
    if (papel === "agente" && !c.agenteEntrou) {
      return finalizar(c, "falhou", { motivo: "O seu telefone não atendeu. Confira se está conectado." });
    }
    // Um dos dois desligou depois de conversar.
    return finalizar(c, "encerrada");
  }
}

let ws = null;
let tentativasWs = 0;
function conectarEventos() {
  const url = new URL(ARI_URL.replace(/^http/, "ws") + "/ari/events");
  url.searchParams.set("app", ARI_APP);
  url.searchParams.set("api_key", `${ARI_USER}:${ARI_SENHA}`);
  ws = new WebSocket(url);
  ws.onopen = () => {
    tentativasWs = 0;
    log("info", "ari_conectada");
  };
  ws.onmessage = (m) => {
    try {
      aoEvento(JSON.parse(String(m.data))).catch((e) => log("erro", "evento_falhou", { erro: String(e) }));
    } catch (e) {
      log("erro", "evento_invalido", { erro: String(e) });
    }
  };
  ws.onclose = () => {
    const espera = Math.min(30_000, 1000 * 2 ** tentativasWs++);
    log("aviso", "ari_caiu", { reconecta_em_ms: espera });
    setTimeout(conectarEventos, espera);
  };
  ws.onerror = () => {};
}

// ---------- Ramais (telefones dos corretores) ----------
let ultimoRamais = existsSync(RAMAIS_CONF) ? readFileSync(RAMAIS_CONF, "utf8") : "";
function sincronizarRamais(ramais) {
  const texto =
    "; Gerado pela ponte do discador. NÃO edite à mão: é reescrito sozinho.\n" +
    ramais
      .filter((r) => /^[A-Za-z0-9]{3,32}$/.test(r.ramal) && /^[A-Za-z0-9]{16,64}$/.test(r.senha))
      .map(
        (r) => `
[${r.ramal}]
type=aor
max_contacts=1
remove_existing=yes

[${r.ramal}]
type=auth
auth_type=userpass
username=${r.ramal}
password=${r.senha}

[${r.ramal}]
type=endpoint
aors=${r.ramal}
auth=${r.ramal}
context=from-corretor
transport=transport-wss
disallow=all
allow=ulaw
allow=alaw
webrtc=yes
dtls_auto_generate_cert=yes
direct_media=no
`,
      )
      .join("");
  if (texto === ultimoRamais) return;
  writeFileSync(RAMAIS_CONF, texto, { mode: 0o640 });
  ultimoRamais = texto;
  execFile("asterisk", ["-rx", "module reload res_pjsip.so"], (erro) =>
    log(erro ? "erro" : "info", "ramais_atualizados", { total: ramais.length, erro: erro ? String(erro) : undefined }),
  );
}

// ---------- Laço principal ----------
let emCiclo = false;
async function ciclo() {
  if (emCiclo) return; // não empilha se a internet estiver lenta
  emCiclo = true;
  try {
    const { ramais, pedidas } = await alexandria({ acao: "buscar" });
    sincronizarRamais(ramais);
    for (const p of pedidas) iniciarChamada(p);
  } catch (e) {
    log("aviso", "alexandria_indisponivel", { erro: String(e) });
  } finally {
    emCiclo = false;
  }
}

log("info", "ponte_iniciada", { alexandria: ALEXANDRIA_URL, ari: ARI_URL });
conectarEventos();
setInterval(ciclo, INTERVALO_MS);
