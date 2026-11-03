#!/usr/bin/env node
/*
 * claude-agent-room — serveur d'événements temps réel
 *   POST /api/event   reçoit un événement (protocole room) OU un payload brut de Hook Claude Code
 *   POST /api/demo    lance la simulation démo (aucun token consommé)
 *   POST /api/reset   vide la chambre
 *   GET  /api/state   historique récent + clients connectés
 *   WS   /ws          flux temps réel vers l'interface
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { HookNormalizer, MAIN_ID } = require('./normalize');
const demo = require('../public/demo-scenario.js');

const PORT = Number(process.env.PORT || process.env.AGENT_ROOM_PORT || 3030);
const HOST = process.env.HOST || '127.0.0.1';
const HISTORY_MAX = 400;
const TYPES = new Set(['SUBAGENT_SPAWN', 'TOOL_START', 'TOOL_END', 'AGENT_MESSAGE', 'SUBAGENT_COMPLETE', 'ERROR', 'RESET']);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const normalizer = new HookNormalizer();

let history = [];
let seq = 0;
let demoTimers = [];
const stats = { received: 0, broadcast: 0 };

function broadcast(event) {
  const data = JSON.stringify({ kind: 'event', event });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
  stats.broadcast++;
}

function sanitize(raw) {
  const e = { ...raw };
  e.type = String(e.type || '').toUpperCase();
  if (!TYPES.has(e.type)) throw new Error(`type inconnu : "${raw.type}"`);
  e.timestamp = Number(e.timestamp) || Date.now();
  e.agentId = String(e.agentId || MAIN_ID);
  if (e.parentId) e.parentId = String(e.parentId);
  if (e.message != null) e.message = String(e.message).slice(0, 4000);
  if (e.prompt != null) e.prompt = String(e.prompt).slice(0, 8000);
  e.id = ++seq;
  return e;
}

function emit(raw) {
  const event = sanitize(raw);
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

function stopDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
}

app.post('/api/event', (req, res) => {
  stats.received++;
  try {
    const bodies = Array.isArray(req.body) ? req.body : [req.body];
    const out = [];
    for (const body of bodies) {
      if (normalizer.isRawHook(body)) {
        for (const ev of normalizer.convert(body)) out.push(emit(ev));
      } else {
        out.push(emit(body));
      }
    }
    res.json({ ok: true, emitted: out.length, events: out });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
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

app.get('/api/health', (req, res) => res.json({ ok: true, port: PORT }));

wss.on('connection', ws => {
  ws.send(JSON.stringify({ kind: 'hello', history, clients: wss.clients.size }));
  ws.on('message', msg => {
    // Permet aussi d'envoyer des événements directement par WebSocket.
    try {
      const body = JSON.parse(msg.toString());
      if (normalizer.isRawHook(body)) normalizer.convert(body).forEach(emit);
      else if (body && body.type) emit(body);
    } catch { /* message ignoré */ }
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖ Le port ${PORT} est déjà utilisé. Lance avec PORT=3031 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  🛋️  Claude Agent Room en ligne → ${url}`);
  console.log(`  📡 Événements : POST ${url}/api/event   |   WebSocket ws://localhost:${PORT}/ws`);
  console.log(`  🎬 Démo       : curl -X POST ${url}/api/demo\n`);
});
