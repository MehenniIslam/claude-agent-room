/*
 * Conseiller tokens : catalogue fermé d'outils vérifiés qui réduisent la consommation de tokens.
 *
 *   claude-agent-room advisor                 liste, gains mesurés, risques
 *   claude-agent-room advisor check           vérifie chaque dépôt (commit relu, licence, archivage)
 *   claude-agent-room advisor apply <ids…>    installe (ids, ou "essentiel" / "gros-projets")
 *   claude-agent-room advisor show <id>       détail et étapes manuelles
 *   claude-agent-room advisor on|off|reset    active / coupe / redemande dans chaque projet
 *
 * Sécurité :
 *   - liste fermée : un id inconnu est refusé ;
 *   - avant chaque plugin, le dépôt est comparé au commit relu : s'il a changé, on montre le lien
 *     de comparaison et on demande une confirmation explicite (ou --yes) ;
 *   - les règles CLAUDE.md sont embarquées (rien n'est téléchargé), insérées entre balises,
 *     avec sauvegarde du fichier existant ;
 *   - jamais de `curl | sh`, de `sudo`, ni de clé API ; les installations manuelles sont seulement affichées.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { advisorState, saveAdvisorState } = require('../bridge/claude-hook.js');

const CATALOG = require('./catalog.json');
const RULES_FILE = path.join(__dirname, 'rules', 'token-efficient.md');
const START = '<!-- claude-agent-room:token-rules:start -->';
const END = '<!-- claude-agent-room:token-rules:end -->';

const byId = id => CATALOG.tools.find(t => t.id === id);

function resolveIds(args) {
  const ids = [];
  for (const a of args) {
    if (a === 'essentiel' || a === 'gros-projets') ids.push(...CATALOG.tools.filter(t => t.pack === a).map(t => t.id));
    else if (byId(a)) ids.push(a);
    else throw new Error(`Outil inconnu : "${a}". Seuls les outils du catalogue vérifié sont acceptés (claude-agent-room advisor).`);
  }
  return [...new Set(ids)];
}

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(`${question} [o/N] `, a => { rl.close(); res(/^(o|oui|y|yes)$/i.test(a.trim())); }));
}

/** État d'un dépôt sur GitHub comparé à la version relue. */
async function repoStatus(tool) {
  const headers = { 'user-agent': 'claude-agent-room', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const get = url => fetch(url, { headers, signal: AbortSignal.timeout(6000) }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  const [repo, commits] = await Promise.all([get(`https://api.github.com/repos/${tool.repo}`), get(`https://api.github.com/repos/${tool.repo}/commits?per_page=1`)]);
  const head = String(commits[0] && commits[0].sha || '').slice(0, 12);
  return {
    head,
    changed: head && !head.startsWith(tool.reviewedSha),
    archived: Boolean(repo.archived),
    license: (repo.license && repo.license.spdx_id) || 'inconnue',
    stars: repo.stargazers_count,
    compare: `https://github.com/${tool.repo}/compare/${tool.reviewedSha}...${head}`
  };
}

function printList() {
  console.log(`\n  💡 Conseiller tokens — catalogue vérifié le ${CATALOG.reviewedAt}`);
  console.log(`     ${CATALOG.policy}\n`);
  for (const pack of ['essentiel', 'gros-projets']) {
    console.log(pack === 'essentiel' ? '  Pack essentiel (site, petite app) :' : '\n  Pour un gros dépôt :');
    for (const t of CATALOG.tools.filter(x => x.pack === pack)) {
      console.log(`   • ${t.id.padEnd(13)} ${t.name} — ${t.savings}`);
      console.log(`     ${''.padEnd(13)} ${t.what}`);
      console.log(`     ${''.padEnd(13)} ⚠ ${t.risks[0]}`);
    }
  }
  console.log('\n  Écartés après vérification :');
  for (const n of CATALOG.notRecommended) console.log(`   ✗ ${n.name} — ${n.why}`);
  const s = advisorState();
  console.log(`\n  Proposition automatique au début d'un projet : ${s.enabled ? 'activée' : 'coupée'} (${Object.keys(s.asked).length} projet(s) déjà vus)`);
  console.log('  Installer : claude-agent-room advisor apply essentiel   ·   Vérifier les dépôts : claude-agent-room advisor check\n');
}

function show(id) {
  const t = byId(id);
  if (!t) throw new Error(`Outil inconnu : "${id}"`);
  console.log(`\n  ${t.name}  (https://github.com/${t.repo}, licence ${t.license}, ★ ${t.stars})`);
  console.log(`  ${t.what}\n  Idéal pour : ${t.bestFor}\n  Gain : ${t.savings}`);
  console.log(`  Exécute du code : ${t.runsCode ? 'oui' : 'non'} · Réseau : ${t.network ? 'oui' : 'non'} · Commit relu : ${t.reviewedSha}`);
  for (const r of t.risks) console.log(`  ⚠ ${r}`);
  console.log('\n  Installation :');
  if (t.install.type === 'plugin') console.log(`    Dans Claude Code : /plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}\n    Depuis un shell  : claude plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}`);
  else if (t.install.type === 'rules') console.log('    claude-agent-room advisor apply rules   (dans le dossier du projet)');
  else for (const s of t.install.steps) console.log(`    ${s}`);
  console.log('');
}

/** Ajoute les règles d'économie au CLAUDE.md du projet (idempotent, sauvegarde, entre balises). */
function applyRules(projectDir = process.cwd()) {
  const file = path.join(projectDir, 'CLAUDE.md');
  const rules = fs.readFileSync(RULES_FILE, 'utf8').trim();
  const block = `${START}\n<!-- Règles d'économie de tokens (drona23/claude-token-efficient, MIT) ajoutées par claude-agent-room. Supprime ce bloc pour les retirer. -->\n${rules}\n${END}`;
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const a = before.indexOf(START), b = before.indexOf(END);
  const text = a >= 0 && b > a ? before.slice(0, a) + block + before.slice(b + END.length) : (before.trimEnd() ? `${before.trimEnd()}\n\n${block}\n` : `${block}\n`);
  if (text === before) return file; // déjà à jour : ni écriture ni sauvegarde
  if (before) fs.copyFileSync(file, `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return file;
}

function hasClaudeCli() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { stdio: 'ignore' });
  return r.status === 0;
}

async function apply(args, { yes = false } = {}) {
  const ids = resolveIds(args.length ? args : ['essentiel']);
  for (const id of ids) {
    const t = byId(id);
    console.log(`\n  → ${t.name}`);
    if (t.install.type === 'rules') {
      console.log(`  ✅ Règles ajoutées à ${applyRules()}`);
      continue;
    }
    if (t.install.type === 'manual') { show(id); continue; }
    // plugin : vérification du dépôt avant toute installation
    let status = null;
    try { status = await repoStatus(t); } catch (e) { console.log(`  ⚠ Vérification impossible (${e.message}).`); }
    if (status && status.archived) { console.log('  ✖ Dépôt archivé : installation refusée.'); continue; }
    if (!status || status.changed) {
      if (status) console.log(`  ⚠ Le dépôt a changé depuis la vérification (${t.reviewedSha} → ${status.head}). Relis les changements : ${status.compare}`);
      if (!yes && !(await ask('  Installer quand même ?'))) { console.log('  Ignoré.'); continue; }
    } else {
      console.log(`  ✔ Dépôt identique à la version relue (${status.head}), licence ${status.license}.`);
    }
    if (hasClaudeCli()) {
      const r = spawnSync('claude', ['plugin', 'install', t.install.plugin, '--marketplace', t.install.marketplace], { stdio: 'inherit', shell: process.platform === 'win32' });
      console.log(r.status === 0 ? '  ✅ Installé. Il sera actif au prochain démarrage de Claude Code.' : '  ✖ L\'installation a échoué (voir ci-dessus).');
    } else {
      console.log(`  Tape dans Claude Code : /plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}`);
    }
  }
  console.log('');
}

async function check() {
  console.log(`\n  🔎 Vérification des dépôts (version relue le ${CATALOG.reviewedAt})\n`);
  let warnings = 0;
  for (const t of CATALOG.tools) {
    try {
      const s = await repoStatus(t);
      const flags = [];
      if (s.archived) flags.push('ARCHIVÉ');
      if (s.license !== t.license && !(t.license === 'Elastic-2.0' && s.license === 'NOASSERTION')) flags.push(`licence ${t.license} → ${s.license}`);
      if (s.changed) flags.push(`modifié depuis ${t.reviewedSha} (${s.compare})`);
      warnings += flags.length ? 1 : 0;
      console.log(`  ${flags.length ? '⚠' : '✔'} ${t.id.padEnd(13)} ★ ${s.stars}  ${flags.length ? flags.join(' · ') : 'identique à la version relue'}`);
    } catch (e) {
      console.log(`  ? ${t.id.padEnd(13)} vérification impossible (${e.message})`);
    }
  }
  console.log(warnings ? '\n  Un dépôt modifié n\'est pas forcément dangereux : relis le lien de comparaison avant d\'installer.\n' : '\n  Tout est conforme.\n');
}

async function run(argv) {
  const [sub, ...rest] = argv;
  const yes = rest.includes('--yes');
  const args = rest.filter(a => !a.startsWith('-'));
  switch (sub) {
    case undefined: case 'list': return printList();
    case 'show': return show(args[0]);
    case 'check': return check();
    case 'apply': return apply(args, { yes });
    case 'on': case 'off': {
      const s = advisorState(); s.enabled = sub === 'on'; saveAdvisorState(s);
      return console.log(sub === 'on' ? '✅ Claude proposera les outils au début de chaque nouveau projet.' : '🔕 Claude ne proposera plus les outils d\'économie de tokens.');
    }
    case 'reset': {
      const s = advisorState(); s.asked = {}; saveAdvisorState(s);
      return console.log('↺ Claude reposera la question au prochain démarrage dans chaque projet.');
    }
    default: throw new Error(`Action inconnue : advisor ${sub} (list, show, check, apply, on, off, reset)`);
  }
}

module.exports = { run, applyRules, resolveIds, CATALOG };
