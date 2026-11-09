const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CLI = path.resolve(__dirname, '../bin/cli.js');

// Lance « setup » dans un HOME jetable, avec un faux « claude » qui note ses arguments.
function runSetup({ installed, port }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-home-'));
  const bin = path.join(home, 'bin');
  const log = path.join(home, 'claude-calls.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'),
    `#!/bin/sh\necho "$@" >> "${log}"\nif [ "$1 $2" = "plugin list" ]; then echo "${installed ? '  ❯ agent-room@claude-agent-room' : 'Installed plugins:'}"; fi\nexit 0\n`,
    { mode: 0o755 });
  const child = spawn(process.execPath, [CLI, 'setup', '--no-open', '--port', String(port)], {
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, AGENT_ROOM_LANG: "fr" },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('setup trop long :\n' + out)), 8000);
    const check = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok) { clearTimeout(t); clearInterval(check); resolve(); }
      } catch { /* pas encore prêt */ }
    }, 100);
  });
  return { home, log, child, ready, output: () => out };
}

for (const installed of [false, true]) {
  test(`setup sans question : hooks, plugin ${installed ? 'déjà là' : 'installé'}, site démarré`, { skip: process.platform === 'win32' }, async () => {
    const port = installed ? 3998 : 3997;
    const run = runSetup({ installed, port });
    try {
      await run.ready;
      const settings = JSON.parse(fs.readFileSync(path.join(run.home, '.claude', 'settings.json'), 'utf8'));
      assert.ok(JSON.stringify(settings.hooks).includes('claude-hook.js'), 'hooks branchés');
      const calls = fs.readFileSync(run.log, 'utf8');
      assert.match(calls, /plugin list/);
      if (installed) assert.doesNotMatch(calls, /plugin install/);
      else assert.match(calls, /plugin install agent-room --marketplace MehenniIslam\/claude-agent-room/);
      assert.doesNotMatch(run.output(), /\[[OY]\/n\]|\[[oy]\/N\]/, 'aucune question posée');
    } finally {
      run.child.kill('SIGTERM');
      fs.rmSync(run.home, { recursive: true, force: true });
    }
  });
}

test('setup sans commande « claude » : le site démarre quand même', { skip: process.platform === 'win32' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-home-'));
  const port = 3996;
  const child = spawn(process.execPath, [CLI, 'setup', '--no-open', '--port', String(port)], {
    env: { ...process.env, HOME: home, PATH: path.dirname(process.execPath), AGENT_ROOM_LANG: "fr" },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* attend */ }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.match(out, /introuvable/);
    assert.ok((await fetch(`http://127.0.0.1:${port}/api/health`)).ok);
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('arrêter « watch » arrête aussi son lecteur de transcript', { skip: process.platform === 'win32' }, async () => {
  const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-watch-'));
  fs.writeFileSync(path.join(dir, 's.jsonl'), '');
  const child = spawn(process.execPath, [CLI, 'watch', dir, '--port', '3995'], { stdio: 'ignore' });
  const kids = () => { try { return execFileSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { return []; } };
  let pids = [];
  for (let i = 0; i < 50 && !pids.length; i++) { await new Promise(r => setTimeout(r, 100)); pids = kids(); }
  assert.ok(pids.length > 0, 'le lecteur a démarré');
  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 800));
  for (const pid of pids) assert.throws(() => process.kill(Number(pid), 0), 'le lecteur est arrêté');
  fs.rmSync(dir, { recursive: true, force: true });
});
