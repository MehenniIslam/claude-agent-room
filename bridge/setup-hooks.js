#!/usr/bin/env node
/*
 * Installe (ou retire) les hooks claude-agent-room dans les réglages Claude Code.
 *
 *   node bridge/setup-hooks.js            → ~/.claude/settings.json (tous tes projets)
 *   node bridge/setup-hooks.js --project  → ./.claude/settings.json (projet courant)
 *   node bridge/setup-hooks.js --remove   → retire les hooks (ajoute --project si besoin)
 *   node bridge/setup-hooks.js --dry-run  → affiche le résultat sans rien écrire
 *
 * Une sauvegarde settings.json.bak-<date> est créée avant toute modification.
 * Les autres hooks déjà présents sont conservés.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = new Set(process.argv.slice(2));
const project = args.has('--project');
const remove = args.has('--remove');
const dryRun = args.has('--dry-run');

const settingsPath = project
  ? path.join(process.cwd(), '.claude', 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');

const hookScript = path.resolve(__dirname, 'claude-hook.js');
const command = `node "${hookScript}"`;
const MARKER = 'claude-hook.js';

// Événements avec matcher (outils) et sans matcher (cycle de vie).
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const LIFECYCLE_EVENTS = ['SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Stop'];

function load() {
  if (!fs.existsSync(settingsPath)) return {};
  const txt = fs.readFileSync(settingsPath, 'utf8').trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch (e) {
    console.error(`✖ ${settingsPath} n'est pas un JSON valide : ${e.message}`);
    process.exit(1);
  }
}

function stripOurs(groups) {
  return (groups || [])
    .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARKER)) }))
    .filter(g => g.hooks.length > 0);
}

const settings = load();
settings.hooks = settings.hooks || {};

for (const ev of [...TOOL_EVENTS, ...LIFECYCLE_EVENTS]) {
  const kept = stripOurs(settings.hooks[ev]);
  if (!remove) {
    const entry = { hooks: [{ type: 'command', command, timeout: 5 }] };
    if (TOOL_EVENTS.includes(ev)) entry.matcher = '*';
    kept.push(entry);
  }
  if (kept.length) settings.hooks[ev] = kept;
  else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

const out = JSON.stringify(settings, null, 2) + '\n';
if (dryRun) {
  console.log(out);
  process.exit(0);
}

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
if (fs.existsSync(settingsPath)) {
  const bak = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(settingsPath, bak);
  console.log(`💾 Sauvegarde : ${bak}`);
}
fs.writeFileSync(settingsPath, out);

if (remove) {
  console.log(`🧹 Hooks claude-agent-room retirés de ${settingsPath}`);
} else {
  console.log(`✅ Hooks installés dans ${settingsPath}`);
  console.log(`   Commande : ${command}`);
  console.log('   Événements : ' + [...TOOL_EVENTS, ...LIFECYCLE_EVENTS].join(', '));
  console.log('\n   1) npm start   (serveur sur http://localhost:3030)');
  console.log('   2) Relance Claude Code (ou /hooks pour vérifier) et donne-lui une tâche avec des sous-agents.');
}
