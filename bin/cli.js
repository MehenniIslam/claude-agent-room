#!/usr/bin/env node
/*
 * claude-agent-room — point d'entrée unique.
 *
 *   claude-agent-room [start] [--port 3030] [--host 127.0.0.1] [--open]
 *   claude-agent-room hooks install|remove|status [--project] [--dry-run]
 *   claude-agent-room demo [--speed 2]
 *   claude-agent-room watch [fichier.jsonl|dossier]
 *   claude-agent-room tui [--256]
 *   claude-agent-room doctor
 */
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('-')));
const positional = argv.filter((a, i) => !a.startsWith('-') && !(i > 0 && /^--(port|host|speed)$/.test(argv[i - 1])));
const option = name => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
  const eq = argv.find(a => a.startsWith(`--${name}=`));
  return eq ? eq.split('=').slice(1).join('=') : undefined;
};
const port = Number(option('port') || process.env.PORT || process.env.AGENT_ROOM_PORT || 3030);
const base = `http://127.0.0.1:${port}`;

const HELP = `
  🛋️  claude-agent-room v${version}
  Visualiseur temps réel de Claude et de ses sous-agents, en pixel art.

  Utilisation :
    claude-agent-room setup               tout installer en une fois (assistant guidé)
    claude-agent-room                     démarre la chambre (http://localhost:3030)
    claude-agent-room --open              … et l'ouvre dans le navigateur
    claude-agent-room hooks install       branche Claude Code (~/.claude/settings.json)
    claude-agent-room hooks install --project   … pour le projet courant seulement
    claude-agent-room hooks remove        débranche Claude Code
    claude-agent-room hooks status        indique si les hooks sont installés
    claude-agent-room demo                lance la démo dans la chambre ouverte
    claude-agent-room watch [chemin]      suit un transcript au lieu des hooks
    claude-agent-room tui                 la chambre dans le terminal (démarre le serveur si besoin)
    claude-agent-room advisor             outils vérifiés pour économiser des tokens
    claude-agent-room advisor apply essentiel   … les installer (avec vérification des dépôts)
    claude-agent-room doctor              vérifie l'installation de A à Z

  Options :
    --port <n>      port du serveur (défaut 3030, ou PORT / AGENT_ROOM_PORT)
    --host <ip>     interface d'écoute (défaut 127.0.0.1 ; 0.0.0.0 = réseau local, jeton exigé)
    --open          ouvre le navigateur au démarrage
    -v, --version   affiche la version
`;

function headers() {
  const h = { 'content-type': 'application/json' };
  if (process.env.AGENT_ROOM_TOKEN) h['x-agent-room-token'] = process.env.AGENT_ROOM_TOKEN;
  return h;
}

async function api(route, opts = {}) {
  const r = await fetch(base + route, { headers: headers(), signal: AbortSignal.timeout(2000), ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
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
  console.error(`✖ Action inconnue : hooks ${action} (install, remove ou status)`);
  process.exitCode = 1;
}

async function cmdDemo() {
  const speed = option('speed') || 1;
  try {
    const r = await api(`/api/demo?speed=${encodeURIComponent(speed)}`, { method: 'POST' });
    console.log(`🎬 Démo lancée : ${r.steps} étapes, ~${Math.round(r.durationMs / 1000)} s. Regarde la chambre !`);
  } catch (e) {
    console.error(`✖ Impossible de joindre la chambre sur ${base} (${e.message}). Lance d'abord : npx github:MehenniIslam/claude-agent-room`);
    process.exitCode = 1;
  }
}

function askYesNo(question, def = true) {
  if (!process.stdin.isTTY || flags.has('--yes')) return Promise.resolve(def);
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(`  ${question} ${def ? '[O/n]' : '[o/N]'} `, a => {
    rl.close();
    const v = a.trim().toLowerCase();
    res(v ? /^(o|oui|y|yes)$/.test(v) : def);
  }));
}

// Assistant : hooks, conseiller tokens, ambiance, puis la chambre s'ouvre. Chaque étape est réversible.
async function cmdSetup() {
  const os = require('os');
  const { saveConfig, loadConfig } = require('../server/config.js');
  console.log(`\n  🛋️  claude-agent-room v${version} — installation guidée\n`);
  if (await askYesNo('Brancher Claude Code à la chambre ? (hooks dans ~/.claude/settings.json, sauvegarde faite avant)')) {
    cmdHooks('install');
  } else {
    console.log('  → Plus tard : claude-agent-room hooks install');
  }
  const advisor = require('../advisor/index.js');
  const tokens = await askYesNo('Au début de chaque nouveau projet, Claude te propose des outils vérifiés qui économisent des tokens ?');
  await advisor.run([tokens ? 'on' : 'off']);
  const cwd = process.cwd();
  if (cwd !== os.homedir() && await askYesNo(`Ajouter tout de suite les règles d'économie au CLAUDE.md de ${cwd} ?`, false)) {
    console.log(`  ✅ Règles ajoutées à ${advisor.applyRules(cwd)}`);
  }
  const pro = await askYesNo('Ambiance « pro » (sobre, pas de fusil à pompe) ? Non = ambiance fun', loadConfig().mode === 'pro');
  saveConfig({ mode: pro ? 'pro' : 'fun' });
  console.log(`  ✅ Ambiance ${pro ? 'pro' : 'fun'} enregistrée (changeable dans la page).\n`);
  console.log('  Tout est prêt. Relance Claude Code pour charger les hooks.\n');
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

  console.log(`\n  🩺 Diagnostic claude-agent-room v${version}\n`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) ok(`Node.js ${process.versions.node}`);
  else bad(`Node.js ${process.versions.node} est trop ancien`, 'Installe Node 18 ou plus récent : https://nodejs.org');

  for (const dep of ['express', 'ws']) {
    try { require.resolve(dep); ok(`Dépendance ${dep} présente`); }
    catch { bad(`Dépendance ${dep} manquante`, 'Lance npm install dans le dossier du projet'); }
  }

  let serverUp = false;
  try {
    const h = await api('/api/health');
    if (h.name === 'claude-agent-room') { serverUp = true; ok(`Serveur joignable sur ${base} (v${h.version}${h.auth ? ', jeton exigé' : ''})`); }
    else bad(`Un autre programme répond sur le port ${port}`, 'Choisis un autre port avec --port et AGENT_ROOM_PORT');
  } catch {
    bad(`Serveur injoignable sur ${base}`, 'Lance la chambre dans un autre terminal : npx github:MehenniIslam/claude-agent-room');
  }

  const scopes = [['global', path.join(os.homedir(), '.claude', 'settings.json')], ['projet', path.join(process.cwd(), '.claude', 'settings.json')]];
  let hooked = false;
  for (const [label, file] of scopes) {
    if (!fs.existsSync(file)) continue;
    try {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '') || '{}');
      const found = setup.isInstalled(settings);
      if (found.length) { hooked = true; ok(`Hooks ${label} installés (${found.length}/${setup.ALL_EVENTS.length}) dans ${file}`); }
      const cmds = JSON.stringify(settings.hooks || {});
      const legacy = /claude-hook\.js/.test(cmds) && !cmds.includes('.claude/agent-room/claude-hook.js');
      if (legacy) warn(`Les hooks ${label} pointent vers une ancienne copie du script → relance : npx github:MehenniIslam/claude-agent-room hooks install${label === 'projet' ? ' --project' : ''}`);
    } catch (e) {
      bad(`${file} n'est pas un JSON valide (${e.message})`, 'Corrige ce fichier : Claude Code ne pourra pas le lire non plus');
    }
  }
  if (!hooked) warn('Aucun hook installé : la chambre ne recevra que la démo. → npx github:MehenniIslam/claude-agent-room hooks install');

  if (fs.existsSync(setup.INSTALLED_HOOK)) {
    const same = fs.readFileSync(setup.INSTALLED_HOOK, 'utf8') === fs.readFileSync(path.resolve(__dirname, '../bridge/claude-hook.js'), 'utf8');
    if (same) ok(`Script du hook à jour (${setup.INSTALLED_HOOK})`);
    else warn('Script du hook installé obsolète → relance : npx github:MehenniIslam/claude-agent-room hooks install');
  } else if (hooked) {
    bad('Hooks déclarés mais script introuvable', 'Relance : npx github:MehenniIslam/claude-agent-room hooks install');
  }

  if (serverUp) {
    try {
      await api('/api/event', { method: 'POST', body: JSON.stringify({ type: 'AGENT_MESSAGE', agentId: 'claude-main', message: '🩺 Diagnostic : le pont fonctionne !', source: 'doctor' }) });
      ok('Événement de test envoyé : une bulle doit apparaître au-dessus de Claude');
    } catch (e) {
      bad(`Envoi d'un événement refusé (${e.message})`, e.message.includes('Jeton') ? 'Exporte AGENT_ROOM_TOKEN avec le jeton affiché par le serveur' : undefined);
    }
  }

  console.log(problems ? `\n  ${problems} problème(s) à corriger.\n` : '\n  Tout est prêt. Donne à Claude une tâche avec des sous-agents !\n');
  process.exitCode = problems ? 1 : 0;
}

async function main() {
  if (flags.has('-h') || flags.has('--help') || positional[0] === 'help') return console.log(HELP);
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
      console.error(`✖ Commande inconnue : ${cmd}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch(err => {
  // Les erreurs réseau du serveur (port occupé…) ont déjà été expliquées par start().
  if (!['EADDRINUSE', 'EACCES'].includes(err.code)) console.error(`✖ ${err.message}`);
  process.exit(1);
});
