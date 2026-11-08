#!/usr/bin/env node
/*
 * claude-agent-room — point d'entrée unique.
 *
 *   claude-agent-room [start] [--port 3030] [--host 127.0.0.1] [--open]
 *   claude-agent-room setup [--no-open] [--yes]
 *   claude-agent-room hooks install|remove|status [--project] [--dry-run]
 *   claude-agent-room demo [--speed 2]
 *   claude-agent-room watch [fichier.jsonl|dossier]
 *   claude-agent-room tui [--256]
 *   claude-agent-room advisor [list|show|check|apply|on|off|reset]
 *   claude-agent-room doctor
 * Partout : --lang fr|en (ou AGENT_ROOM_LANG) pour la langue des messages.
 */
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const { t } = require('./i18n');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('-')));
const positional = argv.filter((a, i) => !a.startsWith('-') && !(i > 0 && /^--(port|host|speed|lang)$/.test(argv[i - 1])));
const option = name => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
  const eq = argv.find(a => a.startsWith(`--${name}=`));
  return eq ? eq.split('=').slice(1).join('=') : undefined;
};
const port = Number(option('port') || process.env.PORT || process.env.AGENT_ROOM_PORT || 3030);
const base = `http://127.0.0.1:${port}`;

function headers() {
  const h = { 'content-type': 'application/json' };
  if (process.env.AGENT_ROOM_TOKEN) h['x-agent-room-token'] = process.env.AGENT_ROOM_TOKEN;
  return h;
}

async function api(route, opts = {}) {
  const r = await fetch(base + route, { headers: headers(), signal: AbortSignal.timeout(2000), ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}

async function cmdStart(open = flags.has('--open')) {
  const { start } = require('../server/index.js');
  const room = await start({ port, host: option('host'), open });
  if (!room) return;
  const stop = () => { room.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function cmdHooks(action = 'install') {
  const { run } = require('../bridge/setup-hooks.js');
  const extra = [...flags].filter(f => ['--project', '--dry-run'].includes(f));
  if (action === 'install') return run(extra);
  if (action === 'remove' || action === 'uninstall') return run(['--remove', ...extra]);
  if (action === 'status') return run(['--status', ...extra]);
  console.error(t('cli.unknownHooks', { action }));
  process.exitCode = 1;
}

async function cmdDemo() {
  const speed = option('speed') || 1;
  try {
    const r = await api(`/api/demo?speed=${encodeURIComponent(speed)}`, { method: 'POST' });
    console.log(t('cli.demoStarted', { steps: r.steps, seconds: Math.round(r.durationMs / 1000) }));
  } catch (e) {
    console.error(t('cli.demoUnreachable', { base, why: e.message }));
    process.exitCode = 1;
  }
}

function askYesNo(question, def = true) {
  if (!process.stdin.isTTY || flags.has('--yes')) return Promise.resolve(def);
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(`  ${question} ${def ? t('yesNo.yes') : t('yesNo.no')} `, a => {
    rl.close();
    const v = a.trim().toLowerCase();
    res(v ? /^(o|oui|y|yes)$/.test(v) : def);
  }));
}

// Assistant : hooks, conseiller tokens, ambiance, puis la chambre s'ouvre. Chaque étape est réversible.
async function cmdSetup() {
  const os = require('os');
  const { saveConfig, loadConfig } = require('../server/config.js');
  console.log(`\n  🛋️  ${t('setup.title', { version })}\n`);
  if (await askYesNo(t('setup.hooks'))) {
    cmdHooks('install');
  } else {
    console.log(`  ${t('setup.hooksLater')}`);
  }
  const advisor = require('../advisor/index.js');
  const tokens = await askYesNo(t('setup.advisor'));
  await advisor.run([tokens ? 'on' : 'off']);
  const cwd = process.cwd();
  if (cwd !== os.homedir() && await askYesNo(t('setup.rules', { dir: cwd }), false)) {
    console.log(`  ${t('setup.rulesAdded', { file: advisor.applyRules(cwd) })}`);
  }
  const pro = await askYesNo(t('setup.pro'), loadConfig().mode === 'pro');
  saveConfig({ mode: pro ? 'pro' : 'fun' });
  console.log(`  ${t('setup.moodSaved', { mood: pro ? 'pro' : 'fun' })}\n`);
  console.log(`  ${t('setup.ready')}\n`);
  return cmdStart(!flags.has('--no-open'));
}

async function cmdTui() {
  // Pas de serveur ? On le démarre dans ce processus, sans rien afficher (le terminal est pour la chambre).
  let up = false;
  try { up = (await api('/api/health')).name === 'claude-agent-room'; } catch { up = false; }
  if (!up) await require('../server/index.js').start({ port, quiet: true });
  require('../tui/index.js').start({ port });
}

function cmdWatch(target) {
  const args = [path.resolve(__dirname, '../bridge/claude-hook.js'), '--jsonl', ...(target ? [target] : [])];
  require('child_process').spawn(process.execPath, args, { stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
}

async function cmdDoctor() {
  const os = require('os');
  const setup = require('../bridge/setup-hooks.js');
  let problems = 0;
  const ok = msg => console.log(`  ✅ ${msg}`);
  const warn = msg => console.log(`  ⚠️  ${msg}`);
  const bad = (msg, fix) => { problems++; console.log(`  ❌ ${msg}${fix ? `\n     → ${fix}` : ''}`); };

  console.log(`\n  🩺 ${t('doctor.title', { version })}\n`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) ok(`Node.js ${process.versions.node}`);
  else bad(t('doctor.nodeOld', { version: process.versions.node }), t('doctor.nodeFix'));

  for (const dep of ['express', 'ws']) {
    try { require.resolve(dep); ok(t('doctor.depOk', { dep })); }
    catch { bad(t('doctor.depMissing', { dep }), t('doctor.depFix')); }
  }

  let serverUp = false;
  try {
    const h = await api('/api/health');
    if (h.name === 'claude-agent-room') { serverUp = true; ok(t('doctor.serverOk', { base, version: h.version, auth: h.auth ? t('doctor.tokenRequired') : '' })); }
    else bad(t('doctor.otherProgram', { port }), t('doctor.otherProgramFix'));
  } catch {
    bad(t('doctor.serverDown', { base }), t('doctor.serverDownFix'));
  }

  const scopes = [['global', path.join(os.homedir(), '.claude', 'settings.json')], ['project', path.join(process.cwd(), '.claude', 'settings.json')]];
  let hooked = false;
  for (const [scope, file] of scopes) {
    if (!fs.existsSync(file)) continue;
    const label = t(`doctor.scope.${scope}`);
    try {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '') || '{}');
      const found = setup.isInstalled(settings);
      if (found.length) { hooked = true; ok(t('doctor.hooksOk', { scope: label, found: found.length, total: setup.ALL_EVENTS.length, file })); }
      const cmds = JSON.stringify(settings.hooks || {});
      const legacy = /claude-hook\.js/.test(cmds) && !cmds.includes('.claude/agent-room/claude-hook.js');
      if (legacy) warn(t('doctor.hooksLegacy', { scope: label, flag: scope === 'project' ? ' --project' : '' }));
    } catch (e) {
      bad(t('doctor.badJson', { file, why: e.message }), t('doctor.badJsonFix'));
    }
  }
  if (!hooked) warn(t('doctor.noHooks'));

  if (fs.existsSync(setup.INSTALLED_HOOK)) {
    const same = fs.readFileSync(setup.INSTALLED_HOOK, 'utf8') === fs.readFileSync(path.resolve(__dirname, '../bridge/claude-hook.js'), 'utf8');
    if (same) ok(t('doctor.scriptOk', { file: setup.INSTALLED_HOOK }));
    else warn(t('doctor.scriptOld'));
  } else if (hooked) {
    bad(t('doctor.scriptMissing'), t('doctor.scriptMissingFix'));
  }

  if (serverUp) {
    try {
      await api('/api/event', { method: 'POST', body: JSON.stringify({ type: 'AGENT_MESSAGE', agentId: 'claude-main', message: t('doctor.pingMessage'), source: 'doctor' }) });
      ok(t('doctor.pingOk'));
    } catch (e) {
      bad(t('doctor.pingFail', { why: e.message }), e.status === 401 ? t('doctor.pingTokenFix') : undefined);
    }
  }

  console.log(`\n  ${problems ? t('doctor.problems', { n: problems }) : t('doctor.allGood')}\n`);
  process.exitCode = problems ? 1 : 0;
}

async function main() {
  const help = () => console.log(t('help', { version }));
  if (flags.has('-h') || flags.has('--help') || positional[0] === 'help') return help();
  if (flags.has('-v') || flags.has('--version')) return console.log(version);
  const [cmd, sub] = positional;
  switch (cmd) {
    case undefined:
    case 'start': return cmdStart();
    case 'hooks': return cmdHooks(sub);
    case 'demo': return cmdDemo();
    case 'watch': return cmdWatch(sub);
    case 'tui': return cmdTui();
    case 'setup': return cmdSetup();
    case 'advisor': return require('../advisor/index.js').run(argv.slice(argv.indexOf('advisor') + 1));
    case 'doctor': return cmdDoctor();
    default:
      console.error(t('cli.unknownCommand', { cmd }));
      help();
      process.exitCode = 1;
  }
}

main().catch(err => {
  // Les erreurs réseau du serveur (port occupé…) ont déjà été expliquées par start().
  if (!['EADDRINUSE', 'EACCES'].includes(err.code)) console.error(`✖ ${err.message}`);
  process.exit(1);
});
