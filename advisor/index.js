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
const { t: tr, field, lang } = require('../bin/i18n');

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
    else throw new Error(tr('adv.unknown', { id: a }));
  }
  return [...new Set(ids)];
}

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(`${question} ${tr('adv.yesNo')} `, a => { rl.close(); res(/^(o|oui|y|yes)$/i.test(a.trim())); }));
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
    license: (repo.license && repo.license.spdx_id) || '?',
    stars: repo.stargazers_count,
    compare: `https://github.com/${tool.repo}/compare/${tool.reviewedSha}...${head}`
  };
}

function printList() {
  console.log(`\n  ${tr('adv.title', { date: CATALOG.reviewedAt })}`);
  console.log(`     ${lang === 'fr' ? CATALOG.policy : CATALOG.policy_en || CATALOG.policy}\n`);
  for (const pack of ['essentiel', 'gros-projets']) {
    console.log(pack === 'essentiel' ? `  ${tr('adv.packEssential')}` : `\n  ${tr('adv.packBig')}`);
    for (const t of CATALOG.tools.filter(x => x.pack === pack)) {
      console.log(`   • ${t.id.padEnd(13)} ${field(t, 'name')} — ${field(t, 'savings')}`);
      console.log(`     ${''.padEnd(13)} ${field(t, 'what')}`);
      console.log(`     ${''.padEnd(13)} ⚠ ${field(t, 'risks')[0]}`);
    }
  }
  console.log(`\n  ${tr('adv.rejected')}`);
  for (const n of CATALOG.notRecommended) console.log(`   ✗ ${n.name} — ${lang === 'fr' ? n.why : n.why_en || n.why}`);
  const s = advisorState();
  console.log(`\n  ${tr('adv.auto', { state: s.enabled ? tr('adv.on') : tr('adv.off'), n: Object.keys(s.asked).length })}`);
  console.log(`  ${tr('adv.hint')}\n`);
}

function show(id) {
  const t = byId(id);
  if (!t) throw new Error(tr('adv.unknown', { id }));
  console.log(`\n  ${tr('adv.show.head', { name: field(t, 'name'), repo: t.repo, license: t.license, stars: t.stars })}`);
  console.log(`  ${field(t, 'what')}\n  ${tr('adv.show.best', { text: field(t, 'bestFor') })}\n  ${tr('adv.show.gain', { text: field(t, 'savings') })}`);
  console.log(`  ${tr('adv.show.facts', { code: t.runsCode ? tr('adv.yes') : tr('adv.no'), net: t.network ? tr('adv.yes') : tr('adv.no'), sha: t.reviewedSha })}`);
  for (const r of field(t, 'risks')) console.log(`  ⚠ ${r}`);
  console.log(`\n  ${tr('adv.show.install')}`);
  if (t.install.type === 'plugin') {
    console.log(`    ${tr('adv.show.inClaude', { cmd: `/plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}` })}`);
    console.log(`    ${tr('adv.show.inShell', { cmd: `claude plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}` })}`);
  } else if (t.install.type === 'rules') console.log(`    ${tr('adv.show.rules')}`);
  else for (const step of t.install.steps) console.log(`    ${step}`);
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
    console.log(`\n  → ${field(t, 'name')}`);
    if (t.install.type === 'rules') {
      console.log(`  ${tr('adv.rulesAdded', { file: applyRules() })}`);
      continue;
    }
    if (t.install.type === 'manual') { show(id); continue; }
    // plugin : vérification du dépôt avant toute installation
    let status = null;
    try { status = await repoStatus(t); } catch (e) { console.log(`  ${tr('adv.checkFailed', { why: e.message })}`); }
    if (status && status.archived) { console.log(`  ${tr('adv.archived')}`); continue; }
    if (!status || status.changed) {
      if (status) console.log(`  ${tr('adv.changed', { from: t.reviewedSha, to: status.head, url: status.compare })}`);
      if (!yes && !(await ask(`  ${tr('adv.installAnyway')}`))) { console.log(`  ${tr('adv.skipped')}`); continue; }
    } else {
      console.log(`  ${tr('adv.same', { sha: status.head, license: status.license })}`);
    }
    const cmd = `/plugin install ${t.install.plugin} --marketplace ${t.install.marketplace}`;
    if (hasClaudeCli()) {
      const r = spawnSync('claude', ['plugin', 'install', t.install.plugin, '--marketplace', t.install.marketplace], { stdio: 'inherit', shell: process.platform === 'win32' });
      console.log(`  ${r.status === 0 ? tr('adv.installed') : tr('adv.installFailed')}`);
    } else {
      console.log(`  ${tr('adv.typeInClaude', { cmd })}`);
    }
  }
  console.log('');
}

async function check() {
  console.log(`\n  ${tr('adv.checkTitle', { date: CATALOG.reviewedAt })}\n`);
  let warnings = 0;
  for (const t of CATALOG.tools) {
    try {
      const s = await repoStatus(t);
      const flags = [];
      if (s.archived) flags.push(tr('adv.checkArchived'));
      if (s.license !== t.license && !(t.license === 'Elastic-2.0' && s.license === 'NOASSERTION')) flags.push(tr('adv.checkLicense', { from: t.license, to: s.license }));
      if (s.changed) flags.push(tr('adv.checkChanged', { sha: t.reviewedSha, url: s.compare }));
      warnings += flags.length ? 1 : 0;
      console.log(`  ${flags.length ? '⚠' : '✔'} ${t.id.padEnd(13)} ★ ${s.stars}  ${flags.length ? flags.join(' · ') : tr('adv.checkSame')}`);
    } catch (e) {
      console.log(`  ? ${t.id.padEnd(13)} ${tr('adv.checkError', { why: e.message })}`);
    }
  }
  console.log(`\n  ${warnings ? tr('adv.checkWarn') : tr('adv.checkOk')}\n`);
}

async function run(argv) {
  // --lang et sa valeur sont pour bin/i18n.js, pas des noms d'outils
  const cleaned = argv.filter((a, i) => a !== '--lang' && argv[i - 1] !== '--lang' && !a.startsWith('--lang='));
  const [sub, ...rest] = cleaned;
  const yes = rest.includes('--yes');
  const args = rest.filter(a => !a.startsWith('-'));
  switch (sub) {
    case undefined: case 'list': return printList();
    case 'show': return show(args[0]);
    case 'check': return check();
    case 'apply': return apply(args, { yes });
    case 'on': case 'off': {
      const s = advisorState(); s.enabled = sub === 'on'; saveAdvisorState(s);
      return console.log(sub === 'on' ? tr('adv.enabled') : tr('adv.disabled'));
    }
    case 'reset': {
      const s = advisorState(); s.asked = {}; saveAdvisorState(s);
      return console.log(tr('adv.reset'));
    }
    default: throw new Error(tr('adv.unknownAction', { action: sub }));
  }
}

module.exports = { run, applyRules, resolveIds, CATALOG };
