const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const { createApp } = require('../server/index.js');

async function boot(opts) {
  const tmp = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "agent-room-test-"));
  const room = createApp({ config: { mode: "fun", history: true, retentionDays: 14 }, historyDir: tmp, usageRoot: tmp, persistConfig: false, ...opts });
  await new Promise(r => room.server.listen(0, '127.0.0.1', r));
  const port = room.server.address().port;
  return { room, port, base: `http://127.0.0.1:${port}` };
}

// http.request plutôt que fetch : fetch interdit de modifier Host.
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* page HTML */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text: data });
      });
    });
    req.on('error', reject);
    if (body) req.end(typeof body === 'string' ? body : JSON.stringify(body));
    else req.end();
  });
}

function wsConnect(port, { origin, query = '' } = {}) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`, origin ? { origin } : {});
    ws.on('message', m => { ws.close(); resolve({ ok: true, msg: JSON.parse(m.toString()) }); });
    ws.on('unexpected-response', (req, res) => resolve({ ok: false, status: res.statusCode }));
    ws.on('error', () => resolve({ ok: false, status: 0 }));
  });
}

const JSON_HEADERS = { 'content-type': 'application/json' };

test('serveur local : page, santé et en-têtes de sécurité', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const page = await request(port);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['x-powered-by'], undefined);
  assert.doesNotMatch(page.text, /fonts\.googleapis/);
  const health = await request(port, { path: '/api/health' });
  assert.equal(health.json.name, 'claude-agent-room');
  assert.equal(health.json.auth, false);
});

test('refuse un hôte étranger (DNS rebinding)', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const r = await request(port, { path: '/api/state', headers: { host: 'evil.example:' + port } });
  assert.equal(r.status, 403);
  const ok = await request(port, { path: '/api/state', headers: { host: 'localhost:' + port } });
  assert.equal(ok.status, 200);
});

test('refuse les requêtes d\'un autre site (CSRF)', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const evil = await request(port, { method: 'POST', path: '/api/reset', headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const same = await request(port, { method: 'POST', path: '/api/reset', headers: { origin: `http://127.0.0.1:${port}` } });
  assert.equal(same.status, 200);
});

test('WebSocket : refuse une origine étrangère, accepte la page et les scripts', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  assert.deepEqual(await wsConnect(port, { origin: 'https://evil.example' }), { ok: false, status: 403 });
  const same = await wsConnect(port, { origin: `http://127.0.0.1:${port}` });
  assert.equal(same.ok, true);
  assert.equal(same.msg.kind, 'hello');
  assert.equal((await wsConnect(port)).ok, true);
});

test('événements : champs filtrés, secrets masqués, erreurs en JSON', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const r = await request(port, {
    method: 'POST', path: '/api/event', headers: JSON_HEADERS,
    body: { type: 'tool_start', agentId: 'sub-1', tool: 'Bash', message: 'export KEY=sk-ant-api03-abcdefghijkl', injected: 'x'.repeat(10000) }
  });
  assert.equal(r.status, 200);
  const ev = r.json.events[0];
  assert.equal(ev.type, 'TOOL_START');
  assert.equal(ev.injected, undefined);
  assert.doesNotMatch(ev.message, /sk-ant/);
  assert.match(ev.message, /MASQUÉ/);

  const bad = await request(port, { method: 'POST', path: '/api/event', headers: JSON_HEADERS, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'JSON invalide');
  assert.doesNotMatch(bad.text, /at .*\.js/); // pas de pile d'erreur

  const unknown = await request(port, { method: 'POST', path: '/api/event', headers: JSON_HEADERS, body: { type: 'HACK' } });
  assert.equal(unknown.status, 400);
});

test('payload brut de Hook Claude Code converti', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const r = await request(port, {
    method: 'POST', path: '/api/event', headers: JSON_HEADERS,
    body: { hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 'toolu_abc123', tool_input: { description: 'Écrire les tests', prompt: 'Teste le login' } }
  });
  assert.equal(r.json.events[0].type, 'SUBAGENT_SPAWN');
  assert.equal(r.json.events[0].role, 'Tester');
  assert.equal(r.json.events[0].source, 'claude-code');
});

test('jeton : exigé pour l\'API et le WebSocket quand on le configure', async t => {
  const { room, port } = await boot({ token: 'secret-de-test' });
  t.after(() => room.close());
  assert.equal((await request(port, { path: '/api/state' })).status, 401);
  assert.equal((await request(port, { path: '/api/state', headers: { 'x-agent-room-token': 'faux' } })).status, 401);
  assert.equal((await request(port, { path: '/api/state', headers: { 'x-agent-room-token': 'secret-de-test' } })).status, 200);
  assert.equal((await request(port, { path: '/api/health' })).json.auth, true);
  assert.equal((await wsConnect(port)).status, 401);
  assert.equal((await wsConnect(port, { query: '?token=secret-de-test' })).ok, true);
});

test('exposé sur le réseau sans jeton : un jeton est généré et exigé', async t => {
  const { room, port } = await boot({ host: '0.0.0.0' });
  t.after(() => room.close());
  assert.equal(room.guard.generated, true);
  assert.ok(room.guard.token.length >= 20);
  assert.equal((await request(port, { method: 'POST', path: '/api/reset' })).status, 401);
  assert.equal((await request(port, { method: 'POST', path: '/api/reset', headers: { authorization: `Bearer ${room.guard.token}` } })).status, 200);
});

test('démo et reset', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const d = await request(port, { method: 'POST', path: '/api/demo?speed=4' });
  assert.equal(d.json.ok, true);
  assert.ok(d.json.steps > 10);
  const s = await request(port, { path: '/api/state' });
  assert.ok(Array.isArray(s.json.history));
});
