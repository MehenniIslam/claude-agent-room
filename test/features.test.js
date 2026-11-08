const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createApp } = require('../server/index.js');
const { HookNormalizer } = require('../server/normalize.js');
const { createUsageTracker, costOf } = require('../server/usage.js');
const { createHistory } = require('../server/history.js');
const { buildAdvisorContext } = require('../bridge/claude-hook.js');
const advisor = require('../advisor/index.js');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-feat-'));
const wait = ms => new Promise(r => setTimeout(r, ms));

function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* texte */ } resolve({ status: res.statusCode, headers: res.headers, json, text: data }); });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function boot(extra = {}) {
  const dir = tmpDir();
  const room = createApp({ config: { mode: 'fun', history: true, retentionDays: 14 }, historyDir: path.join(dir, 'history'), usageRoot: dir, persistConfig: false, ...extra });
  await new Promise(r => room.server.listen(0, '127.0.0.1', r));
  return { room, port: room.server.address().port, dir };
}
const JSON_HEADERS = { 'content-type': 'application/json' };

test('notifications : fin de tour et attente de réponse', () => {
  const n = new HookNormalizer();
  assert.equal(n.convert({ hook_event_name: 'Stop' })[0].type, 'NOTIFY');
  assert.equal(n.convert({ hook_event_name: 'Stop' })[0].kind, 'done');
  const w = n.convert({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' })[0];
  assert.deepEqual([w.type, w.kind], ['NOTIFY', 'waiting']);
  assert.match(w.message, /permission/);
});

test('plan de Claude et diffs extraits des outils', () => {
  const n = new HookNormalizer();
  const [todo] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'bizarre' }] } });
  assert.deepEqual(todo.todos, [{ content: 'A', status: 'completed' }, { content: 'B', status: 'pending' }]);
  const [edit] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.ts', old_string: 'x\ny', new_string: 'z' } });
  assert.equal(edit.diff, '-x\n-y\n+z');
  assert.deepEqual([edit.added, edit.removed], [1, 2]);
  const [task] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '2', status: 'completed' } });
  assert.deepEqual(task.task, { op: 'update', id: '2', status: 'completed', subject: undefined });
});

test('serveur : champs du plan et du diff filtrés, secrets masqués dans le diff', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  const r = await request(port, {
    method: 'POST', path: '/api/event', headers: JSON_HEADERS,
    body: { type: 'TOOL_START', tool: 'Edit', diff: '+API_KEY=sk-ant-api03-abcdefghijkl', added: 1, removed: 'x', todos: [{ content: 'ok', status: 'done?', evil: 1 }, 'pas un objet'] }
  });
  const e = r.json.events[0];
  assert.match(e.diff, /MASQUÉ/);
  assert.equal(e.added, 1);
  assert.equal(e.removed, undefined);
  assert.deepEqual(e.todos, [{ content: 'ok', status: 'pending' }]);
});

test('coût : tokens lus dans le transcript, dédoublonnés, prix par modèle', async () => {
  const root = tmpDir();
  const proj = path.join(root, 'proj');
  fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true });
  const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10000, cache_creation_input_tokens: 2000, cache_creation: { ephemeral_1h_input_tokens: 2000 } };
  const line = (id, model, extra = {}) => JSON.stringify({ type: 'assistant', message: { id, model, usage }, ...extra }) + '\n';
  const main = path.join(proj, 'sess1.jsonl');
  fs.writeFileSync(main, line('m1', 'claude-opus-5-5') + line('m1', 'claude-opus-5-5') + JSON.stringify({ type: 'user', message: { content: 'secret' } }) + '\n');
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-abc.jsonl'), line('s1', 'claude-sonnet-5-5'));
  const tracker = createUsageTracker({ root, intervalMs: 999999 });
  tracker.track({ session_id: 'sess1', transcript_path: main });
  tracker.track({ session_id: 'evil', transcript_path: path.join(os.homedir(), '.ssh', 'id_rsa.jsonl') }); // hors racine : ignoré
  tracker.tick();
  const snap = tracker.snapshot(ref => (ref === 'abc' ? 'sub-1' : undefined));
  tracker.stop();
  assert.equal(snap.total.messages, 2, 'm1 compté une seule fois + le sous-agent');
  assert.equal(snap.agents['claude-main'].messages, 1);
  assert.equal(snap.agents['sub-1'].messages, 1);
  const opus = (1000 * 4 + 500 * 20 + 2000 * 4 * 2 + 10000 * 0.2) / 1e6;
  assert.ok(Math.abs(snap.agents['claude-main'].cost - opus) < 1e-9);
  assert.ok(Math.abs(costOf('claude-sonnet-5-5', usage) - (1000 * 2 + 500 * 10 + 2000 * 2 * 2 + 10000 * 0.2) / 1e6) < 1e-9);
  assert.equal(tracker._files.size, 2);
});

test('historique : écrit sur disque, relu au démarrage, export CSV sans formules', async t => {
  const dir = tmpDir();
  const h = createHistory({ dir, retentionDays: 14 });
  h.append({ type: 'TOOL_START', timestamp: Date.now(), agentId: 'a', tool: 'Bash', message: '=HYPERLINK("http://x")' });
  h.flush();
  assert.equal(h.tail(h.today(), 10).length, 1);
  const chunks = [];
  const res = { setHeader() {}, write: c => { chunks.push(c); return true; }, end() {}, once() {} };
  assert.equal(await h.exportDay(h.today(), 'csv', res), true);
  const csv = chunks.join('');
  assert.match(csv, /"'=HYPERLINK/);
  assert.equal(await h.exportDay('../../etc', 'csv', res), false);
  h.close();

  // un nouveau serveur sur le même dossier retrouve les événements du jour
  const { room, port } = await boot({ historyDir: dir });
  t.after(() => room.close());
  const s = await request(port, { path: '/api/state' });
  assert.ok(s.json.history.some(e => e.tool === 'Bash'));
  const exp = await request(port, { path: `/api/export?format=json` });
  assert.equal(exp.status, 200);
  assert.equal(JSON.parse(exp.text).length, 1);
});

test('ambiance fun / pro partagée par le serveur', async t => {
  const { room, port } = await boot();
  t.after(() => room.close());
  assert.equal((await request(port, { path: '/api/config' })).json.mode, 'fun');
  assert.equal((await request(port, { method: 'POST', path: '/api/config', headers: JSON_HEADERS, body: { mode: 'pirate' } })).status, 400);
  assert.equal((await request(port, { method: 'POST', path: '/api/config', headers: JSON_HEADERS, body: { mode: 'pro' } })).json.mode, 'pro');
  assert.equal((await request(port, { path: '/api/health' })).json.mode, 'pro');
  assert.equal((await request(port, { method: 'POST', path: '/api/config', headers: { ...JSON_HEADERS, origin: 'https://evil.example' }, body: { mode: 'fun' } })).status, 403);
});

test('conseiller tokens : liste fermée, contexte sûr, règles idempotentes', async () => {
  assert.throws(() => advisor.resolveIds(['rtk']), /inconnu/);
  assert.deepEqual(advisor.resolveIds(['essentiel']), ['rules', 'caveman', 'context7']);
  const ctx = buildAdvisorContext(advisor.CATALOG, 'fr');
  assert.match(ctx, /UNE fois/);
  assert.match(ctx, /jamais de `curl \| sh`/);
  assert.match(ctx, /\/plugin install caveman --marketplace JuliusBrussee\/caveman/);
  assert.ok(ctx.length < 4000, `contexte court (${ctx.length} caractères)`);
  for (const t of advisor.CATALOG.tools) {
    assert.match(t.reviewedSha, /^[0-9a-f]{12}$/, t.id);
    if (t.install.type === 'manual') for (const s of t.install.steps) assert.doesNotMatch(s, /curl|sudo|\| *sh/, t.id);
  }
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Projet\n');
  advisor.applyRules(dir);
  advisor.applyRules(dir);
  const md = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.equal(md.split('claude-agent-room:token-rules:start').length, 2, 'un seul bloc');
  assert.match(md, /^# Projet/);
  assert.equal(fs.readdirSync(dir).filter(n => n.includes('.bak-')).length, 1, 'une seule sauvegarde');
  await wait(1);
});

test('traduction : dictionnaire complet en français et en anglais', () => {
  const I18N = require('../public/i18n.js');
  const fr = Object.keys(I18N.dict.fr).sort(), en = Object.keys(I18N.dict.en).sort();
  assert.deepEqual(en.filter(k => !fr.includes(k)), [], 'clés anglaises sans équivalent français');
  assert.deepEqual(fr.filter(k => !en.includes(k)), [], 'clés françaises non traduites en anglais');
  for (const k of fr) {
    const vf = I18N.dict.fr[k], ve = I18N.dict.en[k];
    if (Array.isArray(vf)) { assert.equal(ve.length, vf.length, k); continue; }
    const vars = x => (x.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(ve), vars(vf), `variables différentes pour ${k}`);
  }
  I18N.lang = 'en';
  assert.equal(I18N.msg({ message: 'Je lis a.ts', msg: { k: 'read', a: { file: 'a.ts' } } }), 'Reading a.ts');
  assert.equal(I18N.msg({ message: 'Je lis un fichier', msg: { k: 'read', a: { file: '' } } }), 'Reading a file');
  assert.equal(I18N.msg({ message: 'Bonjour', en: { message: 'Hello' } }), 'Hello');
  assert.equal(I18N.msg({ message: 'texte libre' }), 'texte libre');
  I18N.lang = 'fr';
  assert.equal(I18N.msg({ message: 'Je lis a.ts', msg: { k: 'read', a: { file: 'a.ts' } } }), 'Je lis a.ts');
});

test('traduction : clés générées par le serveur, filtrées à l\'entrée', async t => {
  const n = new HookNormalizer();
  assert.deepEqual(n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x.ts' } })[0].msg, { k: 'read', a: { file: 'x.ts' } });
  assert.deepEqual(n.convert({ hook_event_name: 'Stop' })[0].msg, { k: 'turnDone' });
  const I18N = require('../public/i18n.js');
  for (const ev of [
    { hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'x', path: 'src' } },
    { hook_event_name: 'PreToolUse', tool_name: 'WebSearch', tool_input: { query: 'q' } },
    { hook_event_name: 'UserPromptSubmit', prompt: 'hi' },
    { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { exitCode: 1, stderr: 'boom' } }
  ]) for (const e of n.convert(ev)) if (e.msg) assert.ok(I18N.dict.en[`msg.${e.msg.k}`], `clé sans traduction : ${e.msg.k}`);

  const { room, port } = await boot();
  t.after(() => room.close());
  const r = await request(port, {
    method: 'POST', path: '/api/event', headers: JSON_HEADERS,
    body: { type: 'AGENT_MESSAGE', message: 'x', msg: { k: 'read', a: { file: 'token=abcdef123456', 'bad key': 1, x2: 'y' } }, en: { message: 'Hello sk-ant-api03-abcdefghijkl', evil: 1 } }
  });
  const e = r.json.events[0];
  assert.deepEqual(Object.keys(e.msg.a), ['file']);
  assert.match(e.msg.a.file, /MASQUÉ/);
  assert.deepEqual(Object.keys(e.en), ['message']);
  assert.match(e.en.message, /MASQUÉ/);
  const bad = await request(port, { method: 'POST', path: '/api/event', headers: JSON_HEADERS, body: { type: 'AGENT_MESSAGE', msg: { k: '<script>' } } });
  assert.equal(bad.json.events[0].msg, undefined);
});

test('CLI et terminal : dictionnaire complet, détection de la langue', () => {
  const { DICT, detect } = require('../bin/i18n.js');
  const fr = Object.keys(DICT.fr).sort(), en = Object.keys(DICT.en).sort();
  assert.deepEqual(fr.filter(k => !en.includes(k)), [], 'clés françaises non traduites');
  assert.deepEqual(en.filter(k => !fr.includes(k)), [], 'clés anglaises sans équivalent');
  const vars = x => (x.match(/\{\w+\}/g) || []).sort().join();
  for (const k of fr) assert.equal(vars(DICT.en[k]), vars(DICT.fr[k]), `variables différentes pour ${k}`);
  assert.equal(detect(['node', 'x', '--lang', 'en'], { LANG: 'fr_FR.UTF-8' }), 'en');
  assert.equal(detect(['node', 'x', '--lang=fr'], {}), 'fr');
  assert.equal(detect(['node', 'x'], { AGENT_ROOM_LANG: 'fr' }), 'fr');
  assert.equal(detect(['node', 'x'], { LANG: 'C.UTF-8', LC_ALL: '', AGENT_ROOM_LANG: '', LC_MESSAGES: 'en_GB' }), 'en');
  assert.equal(detect(['node', 'x'], { LANG: 'fr_CA.UTF-8' }), 'fr');
});

test('conseiller tokens en anglais : catalogue traduit, contexte sûr', () => {
  const catalog = advisor.CATALOG;
  for (const t of catalog.tools) {
    for (const k of ['what', 'bestFor', 'savings']) assert.ok(t.en && t.en[k], `${t.id}.en.${k}`);
    assert.equal(t.en.risks.length, t.risks.length, `${t.id} : risques traduits`);
  }
  for (const n of catalog.notRecommended) assert.ok(n.why_en, n.name);
  const ctx = buildAdvisorContext(catalog, 'en');
  assert.match(ctx, /offer the user ONCE/);
  assert.match(ctx, /never `curl \| sh`/);
  assert.match(ctx, /\/plugin install caveman --marketplace JuliusBrussee\/caveman/);
  assert.doesNotMatch(ctx, /Gain : |Risque|l'utilisateur/);
  assert.ok(ctx.length < 4000);
});

test('CLI : aide et commande inconnue dans la langue choisie', () => {
  const { spawnSync } = require('node:child_process');
  const cli = path.join(__dirname, '..', 'bin', 'cli.js');
  const run = (args, lang) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, AGENT_ROOM_LANG: lang } });
  assert.match(run(['--help'], 'en').stdout, /Usage:\s+claude-agent-room setup\s+install everything/);
  assert.match(run(['--help'], 'fr').stdout, /Utilisation :/);
  assert.match(run(['nope', '--lang', 'en']).stderr, /Unknown command: nope/);
  assert.match(run(['advisor', 'apply', 'rtk', '--lang', 'en']).stderr, /Unknown tool: "rtk"/);
});
