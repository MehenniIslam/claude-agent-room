#!/usr/bin/env node
/*
 * claude-agent-room — serveur d'événements temps réel
 *   POST /api/event   reçoit un événement (protocole room) OU un payload brut de Hook Claude Code
 *   POST /api/demo    lance la simulation démo (aucun token consommé)
 *   POST /api/reset   vide la chambre
 *   GET  /api/state   historique récent + clients connectés
 *   GET  /api/health  vérification simple (sans données)
 *   WS   /ws          flux temps réel vers l'interface
 *
 * Sécurité : voir server/security.js (hôte, origine, jeton, débit, en-têtes).
 */
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { HookNormalizer, MAIN_ID } = require('./normalize');
const { createGuard, createRateLimiter, securityHeaders } = require('./security');
const { createUsageTracker } = require('./usage');
const { createHistory } = require('./history');
const { loadConfig, saveConfig } = require('./config');
const { redact } = require('../bridge/claude-hook.js');
const demo = require('../public/demo-scenario.js');
const { version } = require('../package.json');
const { t } = require('../bin/i18n');

const HISTORY_MAX = 400;
const MAX_CLIENTS = 32;
const TYPES = new Set(['SUBAGENT_SPAWN', 'TOOL_START', 'TOOL_END', 'AGENT_MESSAGE', 'SUBAGENT_COMPLETE', 'ERROR', 'NOTIFY', 'RESET']);
// Seuls ces champs sont conservés, tronqués à la longueur indiquée.
const FIELDS = {
  agentId: 120, parentId: 120, targetAgentId: 120, role: 40, name: 60, tool: 80,
  message: 4000, prompt: 8000, file: 500, source: 40, sessionId: 120, kind: 20, diff: 6500
};
const REDACTED = new Set(['message', 'prompt', 'file', 'diff']);
const TODO_STATUS = new Set(['pending', 'in_progress', 'completed']);
const str = (v, n) => (v == null ? undefined : redact(String(v).slice(0, n)));

function sanitize(raw, seq) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('événement invalide : objet JSON attendu');
  const type = String(raw.type || '').toUpperCase();
  if (!TYPES.has(type)) throw new Error(`type inconnu : "${String(raw.type).slice(0, 40)}"`);
  const e = { type, timestamp: Number(raw.timestamp) || Date.now() };
  for (const [key, max] of Object.entries(FIELDS)) {
    if (raw[key] == null || raw[key] === '') continue;
    const value = String(raw[key]).slice(0, max);
    e[key] = REDACTED.has(key) ? redact(value) : value;
  }
  e.agentId = e.agentId || MAIN_ID;
  if (typeof raw.success === 'boolean') e.success = raw.success;
  for (const k of ['added', 'removed']) if (Number.isFinite(raw[k])) e[k] = Math.max(0, Math.min(1e6, Math.round(raw[k])));
  if (Array.isArray(raw.todos)) {
    e.todos = raw.todos.slice(0, 50).filter(t => t && typeof t === 'object')
      .map(t => ({ content: str(t.content, 200) || '', status: TODO_STATUS.has(t.status) ? t.status : 'pending' }));
  }
  if (raw.task && typeof raw.task === 'object' && (raw.task.op === 'add' || raw.task.op === 'update')) {
    e.task = { op: raw.task.op, id: str(raw.task.id, 20), subject: str(raw.task.subject, 200), status: TODO_STATUS.has(raw.task.status) ? raw.task.status : undefined };
  }
  // Traduction : clé de message (lettres seulement) + 6 valeurs texte au plus, masquées comme le reste.
  if (raw.msg && typeof raw.msg === 'object' && /^[A-Za-z]{1,30}$/.test(String(raw.msg.k || ''))) {
    const a = {};
    if (raw.msg.a && typeof raw.msg.a === 'object') {
      for (const [k, v] of Object.entries(raw.msg.a).slice(0, 6)) if (/^[A-Za-z]{1,20}$/.test(k) && v != null) a[k] = str(v, 300);
    }
    e.msg = { k: raw.msg.k, a };
  }
  // Version anglaise fournie par l'émetteur (démo, scripts) : mêmes limites que les champs d'origine.
  if (raw.en && typeof raw.en === 'object') {
    const en = {};
    if (raw.en.message != null) en.message = str(raw.en.message, 4000);
    if (raw.en.prompt != null) en.prompt = str(raw.en.prompt, 8000);
    if (Array.isArray(raw.en.todos)) en.todos = raw.en.todos.slice(0, 50).filter(t => t && typeof t === 'object').map(t => ({ content: str(t.content, 200) || '', status: TODO_STATUS.has(t.status) ? t.status : 'pending' }));
    if (Object.keys(en).length) e.en = en;
  }
  e.id = seq;
  return e;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* pas de navigateur disponible */ }
}

async function probeExisting(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const data = await r.json();
    return data && data.name === 'claude-agent-room';
  } catch {
    return false;
  }
}

function createApp({ host = '127.0.0.1', token = '', allowedHosts = [], config = loadConfig(), historyDir, usageRoot, persistConfig = true } = {}) {
  const guard = createGuard({ host, token, allowedHosts });
  const limit = createRateLimiter();
  const normalizer = new HookNormalizer();
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const settings = { mode: config.mode };
  const disk = createHistory({ dir: historyDir, retentionDays: config.retentionDays, enabled: config.history });

  let history = [];
  let seq = 0;
  let demoTimers = [];
  const stats = { received: 0, broadcast: 0, rejected: 0 };

  function send(payload) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      // Onglet figé ou trop lent : on le coupe plutôt que d'empiler des Mo en mémoire (il se reconnecte seul).
      if (client.bufferedAmount > 8 * 1024 * 1024) { client.terminate(); continue; }
      client.send(data);
    }
  }
  function broadcast(event) {
    send({ kind: 'event', event });
    stats.broadcast++;
  }

  // Coût : les identifiants d'agents de Claude Code sont traduits en agents de la chambre.
  const usageSnapshot = () => usage.snapshot(ref => normalizer.byAgentRef.get(ref));
  let usageTimer = null;
  const usage = createUsageTracker({
    root: usageRoot,
    onChange: () => {
      if (usageTimer) return;
      usageTimer = setTimeout(() => { usageTimer = null; send({ kind: 'usage', usage: usageSnapshot() }); }, 1000);
    }
  });

  function emit(raw) {
    const event = sanitize(raw, ++seq);
    if (event.type === 'RESET') {
      history = [];
      normalizer.reset();
    } else {
      history.push(event);
      if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
      if (event.source !== 'demo' && event.source !== 'doctor') disk.append(event);
    }
    broadcast(event);
    return event;
  }

  function ingest(body) {
    if (normalizer.isRawHook(body)) {
      usage.track(body);
      return normalizer.convert(body).map(emit);
    }
    return [emit(body)];
  }

  // Au démarrage, la chambre retrouve les derniers événements du jour (journal sur disque).
  for (const e of disk.enabled() ? disk.tail(disk.today(), HISTORY_MAX) : []) {
    try { const ev = sanitize(e, ++seq); if (ev.type !== 'RESET') history.push(ev); } catch { /* ligne invalide ignorée */ }
  }

  function stopDemo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
  }

  app.disable('x-powered-by');
  app.set('trust proxy', false);

  // Hôte et origine vérifiés pour TOUTES les requêtes (pages comprises) : anti DNS rebinding.
  app.use((req, res, next) => {
    const bad = guard.check(req, { needToken: false });
    if (bad) { stats.rejected++; return res.status(bad.status).json({ ok: false, error: bad.error }); }
    next();
  });
  app.use(securityHeaders);

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'claude-agent-room', version, auth: Boolean(guard.token), mode: settings.mode }));

  // Le reste de l'API exige le jeton (s'il y en a un) et respecte la limite de débit.
  app.use('/api', (req, res, next) => {
    if (!guard.tokenOk(req)) { stats.rejected++; return res.status(401).json({ ok: false, error: 'Jeton manquant ou invalide (AGENT_ROOM_TOKEN)' }); }
    if (req.method !== 'GET' && !limit(req.socket.remoteAddress || 'local')) {
      return res.status(429).json({ ok: false, error: 'Trop de requêtes, ralentis un peu.' });
    }
    next();
  });
  app.use('/api', express.json({ limit: '512kb' }));

  app.post('/api/event', (req, res) => {
    stats.received++;
    const bodies = Array.isArray(req.body) ? req.body.slice(0, 200) : [req.body];
    const out = [];
    try {
      for (const body of bodies) out.push(...ingest(body));
      res.json({ ok: true, emitted: out.length, events: out });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message, emitted: out.length });
    }
  });

  app.post('/api/demo', (req, res) => {
    stopDemo();
    emit({ type: 'RESET', agentId: MAIN_ID });
    const speed = Math.min(4, Math.max(0.25, Number(req.query.speed) || 1));
    for (const step of demo.steps) {
      const { at, ...ev } = step;
      demoTimers.push(setTimeout(() => emit({ ...ev, source: 'demo' }), at / speed));
    }
    res.json({ ok: true, steps: demo.steps.length, durationMs: Math.round(demo.durationMs / speed) });
  });

  app.post('/api/reset', (req, res) => {
    stopDemo();
    emit({ type: 'RESET', agentId: MAIN_ID });
    res.json({ ok: true });
  });

  app.get('/api/state', (req, res) => {
    res.json({ ok: true, clients: wss.clients.size, stats, history });
  });

  app.get('/api/usage', (req, res) => res.json({ ok: true, usage: usageSnapshot() }));

  // Réglage partagé par tous les écrans : ambiance fun / pro (enregistrée dans config.json).
  app.get('/api/config', (req, res) => res.json({ ok: true, mode: settings.mode }));
  app.post('/api/config', (req, res) => {
    const mode = req.body && req.body.mode;
    if (mode !== 'fun' && mode !== 'pro') return res.status(400).json({ ok: false, error: 'mode attendu : "fun" ou "pro"' });
    settings.mode = mode;
    if (persistConfig) { try { saveConfig({ mode }); } catch { /* lecture seule : réglage gardé en mémoire */ } }
    send({ kind: 'config', mode });
    res.json({ ok: true, mode });
  });

  // Journal sur disque : liste des jours et export pour l'audit.
  app.get('/api/history', (req, res) => res.json({ ok: true, enabled: disk.enabled(), days: disk.days() }));
  app.get('/api/export', async (req, res, next) => {
    try {
      const day = String(req.query.day || disk.today());
      const format = req.query.format === 'csv' ? 'csv' : 'json';
      if (!(await disk.exportDay(day, format, res))) res.status(404).json({ ok: false, error: 'Aucun journal pour ce jour' });
    } catch (err) { next(err); }
  });

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Route inconnue' }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'ignore', index: 'index.html' }));

  // Jamais de pile d'erreur HTML : une réponse JSON courte.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const error = err.type === 'entity.parse.failed' ? 'JSON invalide'
      : err.type === 'entity.too.large' ? 'Requête trop volumineuse'
      : status < 500 ? 'Requête invalide' : 'Erreur interne';
    if (status >= 500) console.error('✖', err);
    res.status(status).json({ ok: false, error });
  });

  server.on('upgrade', (req, socket, head) => {
    const reject = (code, text) => {
      stats.rejected++;
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (new URL(req.url, 'http://x').pathname !== '/ws') return reject(404, 'Not Found');
    const bad = guard.check(req);
    if (bad) return reject(bad.status, bad.status === 401 ? 'Unauthorized' : 'Forbidden');
    if (wss.clients.size >= MAX_CLIENTS) return reject(503, 'Service Unavailable');
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.send(JSON.stringify({ kind: 'hello', history, clients: wss.clients.size, version, mode: settings.mode, usage: usageSnapshot() }));
    const key = `ws:${req.socket.remoteAddress}:${req.socket.remotePort}`;
    ws.on('message', msg => {
      // Permet aussi d'envoyer des événements directement par WebSocket.
      if (!limit(key)) return;
      try {
        const body = JSON.parse(msg.toString());
        if (body && (body.type || normalizer.isRawHook(body))) ingest(body);
      } catch { /* message ignoré */ }
    });
  });

  // Coupe les connexions mortes (onglet fermé sans au revoir, veille…).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 30_000);
  heartbeat.unref();

  function close() {
    stopDemo();
    clearInterval(heartbeat);
    disk.close();
    usage.stop();
    if (usageTimer) clearTimeout(usageTimer);
    for (const ws of wss.clients) ws.terminate();
    return new Promise(resolve => server.close(() => resolve()));
  }

  return { app, server, wss, guard, emit, close, usage, disk, settings };
}

/** Démarre le serveur. Options : port, host, token, open, allowedHosts. */
function start(opts = {}) {
  const port = Number(opts.port ?? process.env.PORT ?? process.env.AGENT_ROOM_PORT ?? 3030);
  const host = opts.host || process.env.HOST || '127.0.0.1';
  const token = opts.token ?? process.env.AGENT_ROOM_TOKEN ?? '';
  const allowedHosts = opts.allowedHosts || String(process.env.AGENT_ROOM_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
  const room = createApp({ host, token, allowedHosts });

  return new Promise((resolve, reject) => {
    room.server.once('error', async err => {
      if (err.code === 'EADDRINUSE') {
        if (await probeExisting(port)) {
          const url = `http://localhost:${port}`;
          console.log(`\n  ${t('server.alreadyRunning', { url })}\n`);
          if (opts.open) openBrowser(url);
          return resolve(null);
        }
        console.error(`\n${t('server.portBusy', { port })}`);
        console.error(`${t('server.portBusyFix')}\n`);
      } else if (err.code === 'EACCES') {
        console.error(`\n${t('server.portDenied', { port })}\n`);
      }
      reject(err);
    });

    room.server.listen(port, host, () => {
      const base = `http://localhost:${port}`;
      const url = room.guard.token ? `${base}/?token=${encodeURIComponent(room.guard.token)}` : base;
      if (!opts.quiet) {
        console.log(`\n  ${t('server.online', { version, url })}`);
        console.log(`  ${t('server.events', { base, port })}`);
        console.log(`  ${t('server.demo')}`);
        if (room.guard.exposed) {
          console.log(`\n  ${t('server.exposed', { host })}`);
          if (room.guard.generated) console.log(`  ${t('server.tokenGenerated', { token: room.guard.token })}`);
          console.log(`  ${t('server.hookHint', { port })}`);
        }
        console.log(`  ${t('server.stop')}\n`);
      }
      if (opts.open) openBrowser(url);
      resolve(room);
    });
  });
}

module.exports = { createApp, start, sanitize };

if (require.main === module) {
  const open = process.argv.includes('--open');
  start({ open }).then(room => {
    if (!room) return;
    const stop = () => { room.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }).catch(() => process.exit(1));
}
