/*
 * Coût et tokens par session et par agent.
 *
 * Les hooks ne donnent pas les tokens, mais chaque payload indique le transcript de la
 * session (`transcript_path`). On lit ces fichiers par morceaux (jamais en entier) et on
 * additionne `message.usage` de chaque réponse de Claude, une seule fois par message.id
 * (une réponse peut occuper plusieurs lignes). Les sous-agents écrivent dans
 * <session>/subagents/agent-<id>.jsonl ou agent-<id>.jsonl à côté du transcript.
 *
 * Sécurité : seuls des .jsonl situés sous ~/.claude/projects sont lus, et seuls les compteurs
 * numériques en sortent (jamais le contenu des conversations).
 *
 * Prix publics Anthropic en $ par million de tokens (estimation : un abonnement Claude Pro/Max
 * ne facture pas au token). Cache : écriture 5 min ×1,25, 1 h ×2 ; lecture ×0,1 sauf exceptions.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRICES = [
  // [préfixe du modèle, entrée, sortie, lecture du cache]
  ['claude-fable-5-1', 10, 50, 0.25], ['claude-mythos-5-1', 10, 50, 0.25],
  ['claude-fable-5', 10, 50, 1], ['claude-mythos-5', 10, 50, 1],
  ['claude-opus-5-5', 4, 20, 0.2], ['claude-opus-5', 5, 25, 0.5], ['claude-opus-4', 5, 25, 0.5],
  ['claude-sonnet-5-5', 2, 10, 0.2], ['claude-sonnet-5', 2, 10, 0.2], ['claude-sonnet-4', 3, 15, 0.3],
  ['claude-haiku-5-5', 0.1, 0.5, 0.01], ['claude-haiku-4', 1, 5, 0.1], ['claude-3', 3, 15, 0.3]
];
const DEFAULT_PRICE = ['?', 2, 10, 0.2];
const CHUNK = 4 * 1024 * 1024;
const MAX_FILES = 200;

function priceFor(model) {
  const m = String(model || '');
  return PRICES.find(([p]) => m.startsWith(p)) || DEFAULT_PRICE;
}

/** Coût en $ d'un bloc `usage` de l'API pour un modèle donné. */
function costOf(model, u) {
  const [, inp, out, read] = priceFor(model);
  const w1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  const w5m = Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return ((u.input_tokens || 0) * inp + (u.output_tokens || 0) * out + w5m * inp * 1.25 + w1h * inp * 2 + (u.cache_read_input_tokens || 0) * read) / 1e6;
}

const emptyTotals = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 0 });
function add(t, model, u) {
  t.input += u.input_tokens || 0;
  t.output += u.output_tokens || 0;
  t.cacheRead += u.cache_read_input_tokens || 0;
  t.cacheWrite += u.cache_creation_input_tokens || 0;
  t.cost += costOf(model, u);
  t.messages += 1;
}

function createUsageTracker({ root = path.join(os.homedir(), '.claude', 'projects'), onChange = () => {}, intervalMs = 3000 } = {}) {
  const rootReal = (() => { try { return fs.realpathSync(root); } catch { return path.resolve(root); } })();
  const files = new Map();   // chemin -> { offset, agentRef, seen:Set, session }
  const sessions = new Map(); // sessionId -> { main: transcript, dir }
  const totals = emptyTotals();
  const byAgent = new Map(); // agentRef ('main' ou id Claude Code) -> totaux
  let dirty = false;

  function allowed(p) {
    if (typeof p !== 'string' || !p.endsWith('.jsonl') || !path.isAbsolute(p)) return false;
    try {
      const real = fs.realpathSync(p);
      const rel = path.relative(rootReal, real);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch { return false; }
  }

  function watchFile(p, agentRef, session) {
    if (files.has(p) || files.size >= MAX_FILES || !allowed(p)) return;
    files.set(p, { offset: 0, agentRef, seen: new Set(), session, partial: '' });
  }

  /** Appelé pour chaque payload de hook : enregistre le transcript de la session. */
  function track(payload) {
    const tp = payload && payload.transcript_path;
    const sid = payload && payload.session_id;
    if (!tp || !sid || sessions.has(sid) || !allowed(tp)) return;
    sessions.set(sid, { main: tp, dir: path.join(path.dirname(tp), path.basename(tp, '.jsonl')) });
    watchFile(tp, 'main', sid);
  }

  function discoverSubagents() {
    for (const [sid, s] of sessions) {
      for (const dir of [path.join(s.dir, 'subagents'), path.dirname(s.main)]) {
        let names = [];
        try { names = fs.readdirSync(dir); } catch { continue; }
        for (const n of names) {
          const m = /^agent-([\w-]+)\.jsonl$/.exec(n);
          if (m) watchFile(path.join(dir, n), m[1], sid);
        }
      }
    }
  }

  function readNew(p, st) {
    let size;
    try { size = fs.statSync(p).size; } catch { return; }
    if (size < st.offset) { st.offset = 0; st.partial = ''; }
    if (size === st.offset) return;
    const len = Math.min(CHUNK, size - st.offset);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(p, 'r');
    try { fs.readSync(fd, buf, 0, len, st.offset); } finally { fs.closeSync(fd); }
    st.offset += len;
    const text = st.partial + buf.toString('utf8');
    const lastNl = text.lastIndexOf('\n');
    // ligne incomplète : gardée pour le prochain passage (bornée pour ne pas grossir sans fin)
    st.partial = lastNl < 0 ? (text.length > CHUNK ? '' : text) : text.slice(lastNl + 1).slice(0, CHUNK);
    if (lastNl < 0) return;
    for (const line of text.slice(0, lastNl).split('\n')) {
      if (!line.includes('"usage"')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const msg = rec.message;
      if (!msg || !msg.usage || rec.type !== 'assistant') continue;
      const id = msg.id || rec.uuid;
      if (st.seen.has(id)) continue;
      st.seen.add(id);
      if (st.seen.size > 20000) st.seen = new Set([...st.seen].slice(-10000));
      const ref = st.agentRef === 'main' && rec.isSidechain && rec.agentId ? rec.agentId : st.agentRef;
      add(totals, msg.model, msg.usage);
      if (!byAgent.has(ref)) byAgent.set(ref, emptyTotals());
      add(byAgent.get(ref), msg.model, msg.usage);
      dirty = true;
    }
  }

  let busy = false;
  function tick() {
    if (busy || !sessions.size) return;
    busy = true;
    try {
      discoverSubagents();
      for (const [p, st] of files) readNew(p, st);
      if (dirty) { dirty = false; onChange(snapshot()); }
    } finally { busy = false; }
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();

  function snapshot(resolve = ref => ref) {
    const agents = {};
    for (const [ref, t] of byAgent) {
      const key = ref === 'main' ? 'claude-main' : (resolve(ref) || 'autres');
      const cur = agents[key] || emptyTotals();
      for (const k of Object.keys(cur)) cur[k] += t[k];
      agents[key] = cur;
    }
    return { total: { ...totals }, agents, sessions: sessions.size, estimate: true };
  }

  function reset() {
    files.clear(); sessions.clear(); byAgent.clear();
    Object.assign(totals, emptyTotals());
  }

  return { track, tick, snapshot, reset, stop: () => clearInterval(timer), _files: files };
}

module.exports = { createUsageTracker, costOf, priceFor };
