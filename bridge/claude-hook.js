#!/usr/bin/env node
/*
 * Pont Claude Code → claude-agent-room
 *
 * Mode hook (par défaut) : Claude Code lance ce script à chaque événement
 * (PreToolUse, PostToolUse, SubagentStart, SubagentStop, UserPromptSubmit, Stop)
 * avec un JSON sur stdin. On le transmet tel quel à POST /api/event ;
 * le serveur le traduit en événement de la chambre.
 * Le script ne bloque jamais Claude : délai max ~700 ms, sortie silencieuse,
 * code de sortie 0 même si le serveur est éteint.
 *
 * Mode JSONL : node bridge/claude-hook.js --jsonl [fichier|dossier]
 * suit un transcript Claude Code (~/.claude/projects/...) et rejoue
 * les appels d'outils en direct, sans configurer de hooks.
 *
 * Confidentialité : avant tout envoi, les secrets reconnaissables (clés API,
 * tokens GitHub/Slack/AWS/Stripe, JWT, clés privées, identifiants dans une URL,
 * `password=...`) sont remplacés par [MASQUÉ].
 *
 * Ce fichier n'utilise que les modules intégrés de Node : setup-hooks.js le
 * copie tel quel dans ~/.claude/agent-room/ pour que le hook continue de
 * marcher si le dépôt est déplacé ou supprimé.
 *
 * Variables : AGENT_ROOM_URL, AGENT_ROOM_PORT, AGENT_ROOM_TOKEN,
 * AGENT_ROOM_TIMEOUT (ms), AGENT_ROOM_DISABLED=1 (coupe le hook).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENDPOINT = process.env.AGENT_ROOM_URL || `http://127.0.0.1:${process.env.AGENT_ROOM_PORT || 3030}/api/event`;
const TIMEOUT_MS = Number(process.env.AGENT_ROOM_TIMEOUT || 700);
const TOKEN = process.env.AGENT_ROOM_TOKEN || '';

/* ---------------------------- Masquage des secrets ---------------------------- */

const MASK = '[MASQUÉ]';
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, MASK],
  [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g, MASK],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{35}/g, MASK],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, `$1${MASK}@`],
  // KEY=valeur (env, CLI, query string), clé: "valeur" entre guillemets, CLE_MAJUSCULE: valeur (YAML / .env)
  [/(\b\w*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\w*=)[^\s"'&,;]{4,}/gi, `$1${MASK}`],
  [/(\b\w*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\w*["']?\s*[:=]\s*["'])[^"'\s]{4,}(?=["'])/gi, `$1${MASK}`],
  [/^(\s*[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*:\s*)\S{4,}/gm, `$1${MASK}`]
];

/** Remplace les secrets reconnaissables dans une chaîne, un tableau ou un objet. */
function redact(v, depth = 0) {
  if (typeof v === 'string') {
    let s = v;
    for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, rep);
    return s;
  }
  if (depth > 12 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => redact(x, depth + 1));
  const o = {};
  for (const [k, val] of Object.entries(v)) o[k] = redact(val, depth + 1);
  return o;
}

async function post(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers = { 'content-type': 'application/json' };
  if (TOKEN) headers['x-agent-room-token'] = TOKEN;
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(redact(body)),
      signal: ctrl.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 1500);
  });
}

async function hookMode() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    const payload = JSON.parse(raw);
    // Les réponses d'outils peuvent être énormes (contenu de fichiers) : on les tronque.
    if (payload.tool_response) payload.tool_response = trimDeep(payload.tool_response, 1500);
    if (payload.tool_input && payload.tool_input.content) payload.tool_input.content = String(payload.tool_input.content).slice(0, 300);
    await post(payload);
  } catch {
    /* jamais d'erreur visible dans Claude Code */
  }
}

function trimDeep(v, max) {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + '…' : v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => trimDeep(x, max));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = trimDeep(val, max);
    return o;
  }
  return v;
}

/* ---------------------------- Mode JSONL ---------------------------- */

function latestTranscript() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  let best = null;
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) {
        const m = fs.statSync(p).mtimeMs;
        if (!best || m > best.m) best = { p, m };
      }
    }
  };
  walk(root);
  return best && best.p;
}

function listJsonl(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(target);
  return out;
}

async function jsonlMode(target) {
  target = target || latestTranscript();
  if (!target || !fs.existsSync(target)) {
    console.error('Aucun transcript trouvé. Usage : node bridge/claude-hook.js --jsonl <fichier.jsonl|dossier>');
    process.exit(1);
  }
  const isDir = fs.statSync(target).isDirectory();
  console.log(`👀 Suivi de ${target} → ${ENDPOINT}`);
  const offsets = new Map();
  const toolNames = new Map();

  // On démarre à la fin des fichiers existants : seul le nouveau trafic est rejoué.
  for (const f of listJsonl(target)) offsets.set(f, fs.statSync(f).size);

  const handleLine = async (line, file) => {
    let rec;
    try { rec = JSON.parse(line); } catch { return; }
    const content = rec.message && Array.isArray(rec.message.content) ? rec.message.content : [];
    const agentFromFile = /agent-([\w-]+)\.jsonl$/.exec(file);
    const agent_id = rec.isSidechain ? (rec.agentId || (agentFromFile && agentFromFile[1])) : undefined;
    for (const c of content) {
      if (c.type === 'tool_use') {
        toolNames.set(c.id, c.name);
        await post({ hook_event_name: 'PreToolUse', session_id: rec.sessionId, tool_name: c.name, tool_input: c.input, tool_use_id: c.id, agent_id });
      } else if (c.type === 'tool_result') {
        const name = toolNames.get(c.tool_use_id);
        if (!name) continue;
        await post({ hook_event_name: 'PostToolUse', session_id: rec.sessionId, tool_name: name, tool_use_id: c.tool_use_id, agent_id,
          tool_response: trimDeep({ content: Array.isArray(c.content) ? c.content : [{ type: 'text', text: String(c.content || '') }], is_error: !!c.is_error }, 1500) });
      } else if (c.type === 'text' && rec.type === 'user' && !rec.isSidechain && typeof c.text === 'string' && !rec.toolUseResult && !c.text.startsWith('<')) {
        await post({ hook_event_name: 'UserPromptSubmit', session_id: rec.sessionId, prompt: c.text });
      }
    }
    if (rec.type === 'user' && !rec.isSidechain && typeof (rec.message && rec.message.content) === 'string' && !rec.message.content.startsWith('<')) {
      await post({ hook_event_name: 'UserPromptSubmit', session_id: rec.sessionId, prompt: rec.message.content });
    }
  };

  const tick = async () => {
    const files = isDir ? listJsonl(target) : [target];
    for (const f of files) {
      let size;
      try { size = fs.statSync(f).size; } catch { continue; }
      const from = offsets.has(f) ? offsets.get(f) : 0;
      if (size <= from) { offsets.set(f, size); continue; }
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      fs.closeSync(fd);
      const text = buf.toString('utf8');
      const lastNl = text.lastIndexOf('\n');
      if (lastNl < 0) continue;
      offsets.set(f, from + Buffer.byteLength(text.slice(0, lastNl + 1)));
      for (const line of text.slice(0, lastNl).split('\n')) if (line.trim()) await handleLine(line, f);
    }
  };
  setInterval(() => { tick().catch(() => {}); }, 400);
}

module.exports = { redact, trimDeep };

if (require.main === module) {
  const args = process.argv.slice(2);
  const j = args.indexOf('--jsonl');
  if (process.env.AGENT_ROOM_DISABLED === '1') process.exit(0);
  else if (j >= 0) jsonlMode(args[j + 1]);
  else hookMode().finally(() => process.exit(0));
}
