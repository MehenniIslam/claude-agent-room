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
