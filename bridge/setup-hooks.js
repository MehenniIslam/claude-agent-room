#!/usr/bin/env node
/*
 * Installe (ou retire) les hooks claude-agent-room dans les réglages Claude Code.
 *
 *   node bridge/setup-hooks.js            → ~/.claude/settings.json (tous tes projets)
 *   node bridge/setup-hooks.js --project  → ./.claude/settings.json (projet courant)
 *   node bridge/setup-hooks.js --remove   → retire les hooks (ajoute --project si besoin)
 *   node bridge/setup-hooks.js --dry-run  → affiche le résultat sans rien écrire
 *   node bridge/setup-hooks.js --status   → indique si les hooks sont installés
 *
 * Le script du hook est copié dans ~/.claude/agent-room/claude-hook.js : les
 * hooks continuent de marcher si ce dépôt est déplacé, supprimé, ou lancé via npx.
 * Une sauvegarde settings.json.bak-<date> est créée avant toute modification,
 * l'écriture est atomique et les autres hooks déjà présents sont conservés.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER = 'claude-hook.js';
// Événements avec matcher (outils) et sans matcher (cycle de vie).
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const LIFECYCLE_EVENTS = ['SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Stop'];
const ALL_EVENTS = [...TOOL_EVENTS, ...LIFECYCLE_EVENTS];

const SOURCE_HOOK = path.resolve(__dirname, 'claude-hook.js');
const INSTALL_DIR = path.join(os.homedir(), '.claude', 'agent-room');
const INSTALLED_HOOK = path.join(INSTALL_DIR, 'claude-hook.js');

function settingsPathFor(project) {
  return project
    ? path.join(process.cwd(), '.claude', 'settings.json')
    : path.join(os.homedir(), '.claude', 'settings.json');
}

// Barres obliques partout : la commande marche aussi bien dans cmd, PowerShell que bash.
function commandFor(hookPath) {
  return `node "${hookPath.split(path.sep).join('/')}"`;
}

function load(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  const txt = fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, '').trim();
  if (!txt) return {};
  try {
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('objet JSON attendu');
    return data;
  } catch (e) {
    throw new Error(`${settingsPath} n'est pas un JSON valide (${e.message}). Corrige-le avant de relancer.`);
  }
}

function stripOurs(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARKER)) }))
    .filter(g => g.hooks.length > 0);
}

/** Retourne les réglages modifiés (sans rien écrire). */
function applyHooks(settings, { remove = false, command }) {
  const out = { ...settings, hooks: { ...(settings.hooks || {}) } };
  for (const ev of ALL_EVENTS) {
    const kept = stripOurs(out.hooks[ev]);
    if (!remove) {
      const entry = { hooks: [{ type: 'command', command, timeout: 5 }] };
      if (TOOL_EVENTS.includes(ev)) entry.matcher = '*';
      kept.push(entry);
    }
    if (kept.length) out.hooks[ev] = kept;
    else delete out.hooks[ev];
  }
  if (!Object.keys(out.hooks).length) delete out.hooks;
  return out;
}

function isInstalled(settings) {
  const hooks = (settings && settings.hooks) || {};
  return ALL_EVENTS.filter(ev => (hooks[ev] || []).some(g => (g.hooks || []).some(h => String(h.command || '').includes(MARKER))));
}

function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function installHookScript() {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.copyFileSync(SOURCE_HOOK, INSTALLED_HOOK);
  return INSTALLED_HOOK;
}

function run(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const project = args.has('--project');
  const remove = args.has('--remove');
  const dryRun = args.has('--dry-run');
  const settingsPath = settingsPathFor(project);
  const settings = load(settingsPath);

  if (args.has('--status')) {
    const found = isInstalled(settings);
    if (found.length) console.log(`✅ Hooks installés dans ${settingsPath} (${found.join(', ')})`);
    else console.log(`○ Aucun hook claude-agent-room dans ${settingsPath}`);
    console.log(fs.existsSync(INSTALLED_HOOK) ? `   Script : ${INSTALLED_HOOK}` : '   Script du hook absent de ~/.claude/agent-room/');
    return found.length > 0;
  }

  const command = commandFor(dryRun ? INSTALLED_HOOK : (remove ? INSTALLED_HOOK : installHookScript()));
  const out = JSON.stringify(applyHooks(settings, { remove, command }), null, 2) + '\n';
  if (dryRun) {
    console.log(out);
    return true;
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (fs.existsSync(settingsPath)) {
    const bak = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(settingsPath, bak);
    console.log(`💾 Sauvegarde : ${bak}`);
  }
  writeAtomic(settingsPath, out);

  if (remove) {
    console.log(`🧹 Hooks claude-agent-room retirés de ${settingsPath}`);
  } else {
    console.log(`✅ Hooks installés dans ${settingsPath}`);
    console.log(`   Commande   : ${command}`);
    console.log(`   Événements : ${ALL_EVENTS.join(', ')}`);
    console.log('\n   1) Lance la chambre : npm start   (http://localhost:3030)');
    console.log('   2) Relance Claude Code (ou /hooks pour vérifier) et donne-lui une tâche avec des sous-agents.');
  }
  return true;
}

module.exports = { applyHooks, isInstalled, commandFor, stripOurs, run, INSTALLED_HOOK };

if (require.main === module) {
  try {
    run();
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}
