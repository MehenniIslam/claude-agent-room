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
const { redact } = require('../bridge/claude-hook.js');
const demo = require('../public/demo-scenario.js');
const { version } = require('../package.json');

const HISTORY_MAX = 400;
const MAX_CLIENTS = 32;
const TYPES = new Set(['SUBAGENT_SPAWN', 'TOOL_START', 'TOOL_END', 'AGENT_MESSAGE', 'SUBAGENT_COMPLETE', 'ERROR', 'RESET']);
// Seuls ces champs sont conservés, tronqués à la longueur indiquée.
const FIELDS = {
  agentId: 120, parentId: 120, targetAgentId: 120, role: 40, name: 60, tool: 80,
  message: 4000, prompt: 8000, file: 500, source: 40, sessionId: 120
};

function sanitize(raw, seq) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('événement invalide : objet JSON attendu');
  const type = String(raw.type || '').toUpperCase();
  if (!TYPES.has(type)) throw new Error(`type inconnu : "${String(raw.type).slice(0, 40)}"`);
  const e = { type, timestamp: Number(raw.timestamp) || Date.now() };
  for (const [key, max] of Object.entries(FIELDS)) {
    if (raw[key] == null || raw[key] === '') continue;
    const value = String(raw[key]).slice(0, max);
    e[key] = key === 'message' || key === 'prompt' || key === 'file' ? redact(value) : value;
  }
  e.agentId = e.agentId || MAIN_ID;
  if (typeof raw.success === 'boolean') e.success = raw.success;
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

function createApp({ host = '127.0.0.1', token = '', allowedHosts = [] } = {}) {
  const guard = createGuard({ host, token, allowedHosts });
  const limit = createRateLimiter();
  const normalizer = new HookNormalizer();
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  let history = [];
  let seq = 0;
  let demoTimers = [];
  const stats = { received: 0, broadcast: 0, rejected: 0 };

  function broadcast(event) {
    const data = JSON.stringify({ kind: 'event', event });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
    stats.broadcast++;
  }

  function emit(raw) {
    const event = sanitize(raw, ++seq);
    if (event.type === 'RESET') {
      history = [];
      normalizer.reset();
    } else {
      history.push(event);
      if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    }
    broadcast(event);
    return event;
  }

  function ingest(body) {
    if (normalizer.isRawHook(body)) return normalizer.convert(body).map(emit);
    return [emit(body)];
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

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'claude-agent-room', version, auth: Boolean(guard.token) }));

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
    ws.send(JSON.stringify({ kind: 'hello', history, clients: wss.clients.size, version }));
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
    for (const ws of wss.clients) ws.terminate();
    return new Promise(resolve => server.close(() => resolve()));
  }

  return { app, server, wss, guard, emit, close };
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
          console.log(`\n  🛋️  La chambre tourne déjà → ${url}\n`);
          if (opts.open) openBrowser(url);
          return resolve(null);
        }
        console.error(`\n✖ Le port ${port} est déjà utilisé par un autre programme.`);
        console.error(`  Choisis-en un autre : npx github:MehenniIslam/claude-agent-room --port 3031  (et AGENT_ROOM_PORT=3031 pour le hook)\n`);
      } else if (err.code === 'EACCES') {
        console.error(`\n✖ Accès refusé au port ${port}. Essaie un port au-dessus de 1024.\n`);
      }
      reject(err);
    });

    room.server.listen(port, host, () => {
      const base = `http://localhost:${port}`;
      const url = room.guard.token ? `${base}/?token=${encodeURIComponent(room.guard.token)}` : base;
      if (!opts.quiet) {
        console.log(`\n  🛋️  Claude Agent Room v${version} en ligne → ${url}`);
        console.log(`  📡 Événements : POST ${base}/api/event   |   WebSocket ws://localhost:${port}/ws`);
        console.log(`  🎬 Démo       : npx github:MehenniIslam/claude-agent-room demo   (ou le bouton dans la page)`);
        if (room.guard.exposed) {
          console.log(`\n  ⚠️  Serveur exposé sur le réseau (${host}). Un jeton est exigé pour l'API et le WebSocket.`);
          if (room.guard.generated) console.log(`     Jeton généré pour cette session : ${room.guard.token}`);
          console.log('     Pour le hook : AGENT_ROOM_TOKEN=<jeton> et AGENT_ROOM_URL=http://<cette-machine>:' + port + '/api/event');
        }
        console.log('  Ctrl+C pour arrêter.\n');
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
