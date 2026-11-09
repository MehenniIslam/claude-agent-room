const test = require('node:test');
const assert = require('node:assert/strict');
const { redact, shrinkPayload, salvage } = require('../bridge/claude-hook.js');
const { applyHooks, isInstalled, commandFor } = require('../bridge/setup-hooks.js');
const { HookNormalizer } = require('../server/normalize.js');

test('redact masque les secrets courants', () => {
  const cases = [
    'export ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop',
    'git push https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/x/y',
    'curl -H "Authorization: Bearer abcdefghijklmnopqrstu"',
    'psql postgres://admin:hunter22@db:5432/app',
    'AWS AKIAABCDEFGHIJKLMNOP',
    'password="monSuperMdp"',
    'DB_PASSWORD: s3cr3t!',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----'
  ];
  for (const c of cases) {
    const out = redact(c);
    assert.match(out, /MASQUÉ/, c);
    assert.doesNotMatch(out, /abcdefghijklmnop|hunter22|monSuperMdp|s3cr3t|MIIabc|AKIAABCD/, c);
  }
});

test('redact laisse le code et les chemins ordinaires intacts', () => {
  for (const s of ['npm test -- oauth', 'src/auth/tokenizer.ts', 'const token = getToken()', 'grep "password" src/']) {
    assert.equal(redact(s), s);
  }
  assert.deepEqual(redact({ a: ['MY_TOKEN=abcd1234'], n: 3 }), { a: ['MY_TOKEN=[MASQUÉ]'], n: 3 });
});

test('setup-hooks : installation idempotente qui conserve les autres hooks', () => {
  const command = commandFor('/home/me/.claude/agent-room/claude-hook.js');
  const mine = { type: 'command', command: 'echo autre' };
  const base = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [mine] }] } };
  const once = applyHooks(base, { command });
  const twice = applyHooks(once, { command });
  assert.deepEqual(once, twice);
  assert.equal(once.model, 'opus');
  assert.equal(isInstalled(once).length, 8);
  assert.equal(once.hooks.PreToolUse.length, 2);
  assert.deepEqual(once.hooks.PreToolUse[0].hooks[0], mine);
  const removed = applyHooks(once, { remove: true, command });
  assert.deepEqual(removed, base);
});

test('commandFor utilise des barres obliques (cmd, PowerShell et bash)', () => {
  assert.doesNotMatch(commandFor('C:\\Users\\moi\\.claude\\agent-room\\claude-hook.js'), /\\/);
});

test('normalizer : spawn, outil attribué au sous-agent, fin de mission', () => {
  const n = new HookNormalizer();
  const [spawn] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 'toolu_1', tool_input: { description: 'Explorer le code', prompt: 'cherche' } });
  assert.equal(spawn.type, 'SUBAGENT_SPAWN');
  assert.equal(spawn.role, 'Researcher');
  const [tool] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'src/a.ts' } });
  assert.equal(tool.agentId, spawn.agentId);
  assert.equal(tool.file, 'src/a.ts');
  const fail = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { exitCode: 1, stderr: 'boom' } });
  assert.deepEqual(fail.map(e => e.type), ['TOOL_END', 'ERROR']);
  const done = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: 'toolu_1', tool_response: { content: [{ type: 'text', text: 'Fini' }] } });
  assert.equal(done.at(-1).type, 'SUBAGENT_COMPLETE');
  const [after] = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} });
  assert.equal(after.agentId, 'claude-main');
});

test('gros projet : un Edit ou MultiEdit énorme reste sous la limite du serveur', () => {
  const big = 'x'.repeat(3 * 1024 * 1024);
  const payload = shrinkPayload({
    hook_event_name: 'PreToolUse', tool_name: 'MultiEdit',
    tool_input: { file_path: 'src/huge.ts', edits: Array.from({ length: 500 }, () => ({ old_string: big, new_string: big })) },
    tool_response: { content: [{ type: 'text', text: big }] }
  });
  assert.ok(JSON.stringify(payload).length < 200 * 1024);
  assert.equal(payload.tool_input.file_path, 'src/huge.ts');
});

test('stdin tronqué ou illisible : on récupère quand même l\'événement', () => {
  const raw = '{"session_id":"s1","hook_event_name":"PostToolUse","tool_name":"Read","tool_response":{"content":"' + 'y'.repeat(50000);
  assert.deepEqual(
    { ...salvage(raw), tool_input: undefined },
    { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: undefined, session_id: 's1', agent_id: undefined, tool_input: undefined }
  );
  assert.equal(salvage('pas du json'), null);
});

test('longue session : la mémoire du normalizer reste bornée', () => {
  const n = new HookNormalizer();
  for (let i = 0; i < 1000; i++) {
    n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: `toolu_${i}`, tool_input: { description: 'Agent ' + i } });
    n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: `toolu_${i}`, tool_response: 'ok' });
  }
  assert.ok(n.subs.size <= 300);
  assert.ok(n.byToolUse.size <= 300);
  for (let i = 0; i < 150; i++) n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: `open_${i}`, tool_input: {} });
  assert.ok(n.stack.length <= 100);
});

test('sous-agent en arrière-plan : le lancement n\'est pas un rapport, SubagentStop clôt la mission', () => {
  const n = new HookNormalizer();
  const spawn = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'tu1', tool_input: { description: 'Écrire le CSS', prompt: 'Écris a.css' } });
  const id = spawn.find(e => e.type === 'SUBAGENT_SPAWN').agentId;
  const launch = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'tu1',
    tool_response: { content: [{ type: 'text', text: 'Async agent launched successfully. (This tool result is internal metadata.)\nagentId: abc123 (internal ID)' }] } });
  assert.deepEqual(launch, [], 'aucun faux rapport');
  // ses outils lui sont attribués, ceux de Claude (sans agent_id) restent à Claude
  const sub = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Write', agent_id: 'abc123', tool_input: { file_path: '/t/a.css', content: 'x' } });
  assert.equal(sub[0].agentId, id);
  const main = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/t/b' } });
  assert.notEqual(main[0].agentId, id);
  const stop = n.convert({ hook_event_name: 'SubagentStop', agent_id: 'abc123', last_assistant_message: 'a.css prêt.' });
  assert.equal(stop[0].type, 'SUBAGENT_COMPLETE');
  assert.equal(stop[0].agentId, id);
  assert.match(stop[0].message, /a\.css prêt/);
  assert.doesNotMatch(JSON.stringify([...launch, ...stop]), /internal metadata/);
});

test('sous-agent classique : la réponse de l\'outil Agent reste son rapport', () => {
  const n = new HookNormalizer();
  n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'tu2', tool_input: { description: 'Lire', prompt: 'Lis' } });
  const done = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'tu2', tool_response: { content: [{ type: 'text', text: 'Fichier lu.' }] } });
  assert.equal(done.at(-1).type, 'SUBAGENT_COMPLETE');
  assert.match(done.at(-1).message, /Fichier lu/);
});


test('sous-agent en arrière-plan : SubagentHandback remet le rapport, la fin d\'un appel revient à son auteur', () => {
  const n = new HookNormalizer();
  // Claude commence un appel, puis lance un sous-agent avant que l'appel ne finisse
  n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 'r1', tool_input: { file_path: '/t/x' } });
  const id = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'tu3', tool_input: { description: 'Relire le CSS', prompt: 'Relis' } })
    .find(e => e.type === 'SUBAGENT_SPAWN').agentId;
  const end = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 'r1', tool_response: { content: [] } });
  assert.notEqual(end[0].agentId, id, 'la fin du Read de Claude reste à Claude');
  n.convert({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'tu3', tool_response: { content: [{ type: 'text', text: 'Async agent launched successfully.\nagentId: zz9 (internal ID)' }] } });
  const done = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', agent_id: 'zz9', tool_input: { message: 'CSS relu, line-height ajouté.' } });
  assert.equal(done[0].type, 'SUBAGENT_COMPLETE');
  assert.equal(done[0].agentId, id);
  assert.match(done[0].message, /line-height/);
  assert.deepEqual(n.convert({ hook_event_name: 'SubagentStop', agent_id: 'zz9', last_assistant_message: 'x' }), [], 'pas de double fin');
  assert.deepEqual(n.convert({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'zz9', tool_response: { content: [] } }), [], 'ne revient pas au travail');
});

test('watch : un appel du transcript principal reste à Claude, même s\'il arrive après un lancement de sous-agent', () => {
  const n = new HookNormalizer();
  const id = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'tu4', main_loop: true, tool_input: { description: 'Relire', prompt: 'Relis' } })
    .find(e => e.type === 'SUBAGENT_SPAWN').agentId;
  const click = n.convert({ hook_event_name: 'PreToolUse', tool_name: 'mcp__Claude_Browser__computer', tool_use_id: 'c1', main_loop: true, tool_input: {} });
  assert.notEqual(click[0].agentId, id);
  const end = n.convert({ hook_event_name: 'PostToolUse', tool_name: 'mcp__Claude_Browser__computer', tool_use_id: 'c1', tool_response: { content: [] } });
  assert.notEqual(end[0].agentId, id);
});
