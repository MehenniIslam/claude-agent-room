/*
 * Textes du CLI, du serveur (console), du conseiller tokens et du mode terminal, en français et en anglais.
 *
 * Langue : --lang en|fr > AGENT_ROOM_LANG > LC_ALL / LC_MESSAGES / LANG > langue du système.
 *   const { t, lang } = require('./i18n');  t('cle', { var })
 * Les textes de la page web sont dans public/i18n.js.
 */

function detect(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--lang');
  const flag = i >= 0 ? argv[i + 1] : (argv.find(a => a.startsWith('--lang=')) || '').split('=')[1];
  const sys = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return ''; } })();
  for (const v of [flag, env.AGENT_ROOM_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG, sys]) {
    const s = String(v || '').toLowerCase();
    if (!s || s === 'c' || s.startsWith('c.') || s === 'posix') continue;
    return s.startsWith('fr') ? 'fr' : 'en';
  }
  return 'en';
}

const CMD = 'npx github:MehenniIslam/claude-agent-room';

const fr = {
  // aide
  help: `
  🛋️  claude-agent-room v{version}
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
    --lang fr|en    langue des messages (ou AGENT_ROOM_LANG)
    -v, --version   affiche la version
`,
  'cli.unknownCommand': '✖ Commande inconnue : {cmd}',
  'cli.unknownHooks': '✖ Action inconnue : hooks {action} (install, remove ou status)',
  'cli.demoStarted': '🎬 Démo lancée : {steps} étapes, ~{seconds} s. Regarde la chambre !',
  'cli.demoUnreachable': `✖ Impossible de joindre la chambre sur {base} ({why}). Lance d'abord : ${CMD}`,
  'yesNo.yes': '[O/n]', 'yesNo.no': '[o/N]',
  // setup
  'setup.title': 'claude-agent-room v{version} — installation guidée',
  'setup.hooks': 'Brancher Claude Code à la chambre ? (hooks dans ~/.claude/settings.json, sauvegarde faite avant)',
  'setup.hooksLater': '→ Plus tard : claude-agent-room hooks install',
  'setup.advisor': 'Au début de chaque nouveau projet, Claude te propose des outils vérifiés qui économisent des tokens ?',
  'setup.rules': "Ajouter tout de suite les règles d'économie au CLAUDE.md de {dir} ?",
  'setup.rulesAdded': '✅ Règles ajoutées à {file}',
  'setup.pro': 'Ambiance « pro » (sobre, pas de fusil à pompe) ? Non = ambiance fun',
  'setup.moodSaved': '✅ Ambiance {mood} enregistrée (changeable dans la page).',
  'setup.ready': 'Tout est prêt. Relance Claude Code pour charger les hooks.',
  // doctor
  'doctor.title': 'Diagnostic claude-agent-room v{version}',
  'doctor.nodeOld': 'Node.js {version} est trop ancien',
  'doctor.nodeFix': 'Installe Node 18 ou plus récent : https://nodejs.org',
  'doctor.depOk': 'Dépendance {dep} présente',
  'doctor.depMissing': 'Dépendance {dep} manquante',
  'doctor.depFix': 'Lance npm install dans le dossier du projet',
  'doctor.serverOk': 'Serveur joignable sur {base} (v{version}{auth})',
  'doctor.tokenRequired': ', jeton exigé',
  'doctor.otherProgram': 'Un autre programme répond sur le port {port}',
  'doctor.otherProgramFix': 'Choisis un autre port avec --port et AGENT_ROOM_PORT',
  'doctor.serverDown': 'Serveur injoignable sur {base}',
  'doctor.serverDownFix': `Lance la chambre dans un autre terminal : ${CMD}`,
  'doctor.scope.global': 'global', 'doctor.scope.project': 'projet',
  'doctor.hooksOk': 'Hooks {scope} installés ({found}/{total}) dans {file}',
  'doctor.hooksLegacy': `Les hooks {scope} pointent vers une ancienne copie du script → relance : ${CMD} hooks install{flag}`,
  'doctor.badJson': "{file} n'est pas un JSON valide ({why})",
  'doctor.badJsonFix': 'Corrige ce fichier : Claude Code ne pourra pas le lire non plus',
  'doctor.noHooks': `Aucun hook installé : la chambre ne recevra que la démo. → ${CMD} hooks install`,
  'doctor.scriptOk': 'Script du hook à jour ({file})',
  'doctor.scriptOld': `Script du hook installé obsolète → relance : ${CMD} hooks install`,
  'doctor.scriptMissing': 'Hooks déclarés mais script introuvable',
  'doctor.scriptMissingFix': `Relance : ${CMD} hooks install`,
  'doctor.pingMessage': '🩺 Diagnostic : le pont fonctionne !',
  'doctor.pingOk': 'Événement de test envoyé : une bulle doit apparaître au-dessus de Claude',
  'doctor.pingFail': "Envoi d'un événement refusé ({why})",
  'doctor.pingTokenFix': 'Exporte AGENT_ROOM_TOKEN avec le jeton affiché par le serveur',
  'doctor.problems': '{n} problème(s) à corriger.',
  'doctor.allGood': 'Tout est prêt. Donne à Claude une tâche avec des sous-agents !',
  // hooks
  'hooks.badJson': "{file} n'est pas un JSON valide ({why}). Corrige-le avant de relancer.",
  'hooks.jsonObject': 'objet JSON attendu',
  'hooks.installedIn': '✅ Hooks installés dans {file} ({events})',
  'hooks.none': '○ Aucun hook claude-agent-room dans {file}',
  'hooks.script': '   Script : {file}',
  'hooks.scriptMissing': '   Script du hook absent de ~/.claude/agent-room/',
  'hooks.backup': '💾 Sauvegarde : {file}',
  'hooks.removed': '🧹 Hooks claude-agent-room retirés de {file}',
  'hooks.installed': '✅ Hooks installés dans {file}',
  'hooks.command': '   Commande   : {cmd}',
  'hooks.events': '   Événements : {events}',
  'hooks.next1': '   1) Lance la chambre : npm start   (http://localhost:3030)',
  'hooks.next2': '   2) Relance Claude Code (ou /hooks pour vérifier) et donne-lui une tâche avec des sous-agents.',
  // serveur
  'server.alreadyRunning': '🛋️  La chambre tourne déjà → {url}',
  'server.portBusy': '✖ Le port {port} est déjà utilisé par un autre programme.',
  'server.portBusyFix': `  Choisis-en un autre : ${CMD} --port 3031  (et AGENT_ROOM_PORT=3031 pour le hook)`,
  'server.portDenied': '✖ Accès refusé au port {port}. Essaie un port au-dessus de 1024.',
  'server.online': '🛋️  Claude Agent Room v{version} en ligne → {url}',
  'server.events': '📡 Événements : POST {base}/api/event   |   WebSocket ws://localhost:{port}/ws',
  'server.demo': `🎬 Démo       : ${CMD} demo   (ou le bouton dans la page)`,
  'server.exposed': "⚠️  Serveur exposé sur le réseau ({host}). Un jeton est exigé pour l'API et le WebSocket.",
  'server.tokenGenerated': '   Jeton généré pour cette session : {token}',
  'server.hookHint': '   Pour le hook : AGENT_ROOM_TOKEN=<jeton> et AGENT_ROOM_URL=http://<cette-machine>:{port}/api/event',
  'server.stop': 'Ctrl+C pour arrêter.',
  'watch.following': '👀 Suivi de {target} → {endpoint}',
  'watch.none': 'Aucun transcript trouvé. Usage : node bridge/claude-hook.js --jsonl <fichier.jsonl|dossier>',
  // conseiller tokens
  'adv.title': '💡 Conseiller tokens — catalogue vérifié le {date}',
  'adv.packEssential': 'Pack essentiel (site, petite app) :',
  'adv.packBig': 'Pour un gros dépôt :',
  'adv.rejected': 'Écartés après vérification :',
  'adv.auto': "Proposition automatique au début d'un projet : {state} ({n} projet(s) déjà vus)",
  'adv.on': 'activée', 'adv.off': 'coupée',
  'adv.hint': 'Installer : claude-agent-room advisor apply essentiel   ·   Vérifier les dépôts : claude-agent-room advisor check',
  'adv.unknown': 'Outil inconnu : "{id}". Seuls les outils du catalogue vérifié sont acceptés (claude-agent-room advisor).',
  'adv.unknownAction': 'Action inconnue : advisor {action} (list, show, check, apply, on, off, reset)',
  'adv.show.head': '{name}  (https://github.com/{repo}, licence {license}, ★ {stars})',
  'adv.show.best': 'Idéal pour : {text}', 'adv.show.gain': 'Gain : {text}',
  'adv.show.facts': 'Exécute du code : {code} · Réseau : {net} · Commit relu : {sha}',
  'adv.yes': 'oui', 'adv.no': 'non',
  'adv.show.install': 'Installation :',
  'adv.show.inClaude': 'Dans Claude Code : {cmd}', 'adv.show.inShell': 'Depuis un shell  : {cmd}',
  'adv.show.rules': 'claude-agent-room advisor apply rules   (dans le dossier du projet)',
  'adv.rulesAdded': '✅ Règles ajoutées à {file}',
  'adv.checkFailed': '⚠ Vérification impossible ({why}).',
  'adv.archived': '✖ Dépôt archivé : installation refusée.',
  'adv.changed': '⚠ Le dépôt a changé depuis la vérification ({from} → {to}). Relis les changements : {url}',
  'adv.installAnyway': 'Installer quand même ?',
  'adv.yesNo': '[o/N]',
  'adv.skipped': 'Ignoré.',
  'adv.same': '✔ Dépôt identique à la version relue ({sha}), licence {license}.',
  'adv.installed': '✅ Installé. Il sera actif au prochain démarrage de Claude Code.',
  'adv.installFailed': "✖ L'installation a échoué (voir ci-dessus).",
  'adv.typeInClaude': 'Tape dans Claude Code : {cmd}',
  'adv.checkTitle': '🔎 Vérification des dépôts (version relue le {date})',
  'adv.checkArchived': 'ARCHIVÉ',
  'adv.checkLicense': 'licence {from} → {to}',
  'adv.checkChanged': 'modifié depuis {sha} ({url})',
  'adv.checkSame': 'identique à la version relue',
  'adv.checkError': 'vérification impossible ({why})',
  'adv.checkWarn': "Un dépôt modifié n'est pas forcément dangereux : relis le lien de comparaison avant d'installer.",
  'adv.checkOk': 'Tout est conforme.',
  'adv.enabled': '✅ Claude proposera les outils au début de chaque nouveau projet.',
  'adv.disabled': "🔕 Claude ne proposera plus les outils d'économie de tokens.",
  'adv.reset': '↺ Claude reposera la question au prochain démarrage dans chaque projet.',
  // mode terminal
  'tui.needTty': "✖ Le mode terminal a besoin d'un vrai terminal (stdout n'est pas un TTY).",
  'tui.keys': 'q quitter · d démo · r vider · w monde',
  'tui.live': 'En direct', 'tui.connecting': 'Connexion…', 'tui.lost': 'Connexion perdue, nouvel essai…',
  'tui.unreachable': 'Serveur injoignable sur {base} (lance la chambre)', 'tui.token': 'Jeton requis (AGENT_ROOM_TOKEN)',
  'tui.refused': 'Refusé ({code})', 'tui.claude': 'Claude Code branché',
  'tui.alertWaiting': '⏳ Claude attend ta réponse', 'tui.alertDone': '✅ Claude a fini',
  'tui.agents': 'Agents', 'tui.working': '{n} au travail · {m} en pause', 'tui.orchestrates': 'orchestre',
  'tui.noAgents': 'Aucun sous-agent pour le moment.', 'tui.error': 'erreur', 'tui.done': 'terminé',
  'tui.plan': 'Plan', 'tui.files': 'Fichiers modifiés', 'tui.none': 'aucun', 'tui.log': 'Journal',
  'tui.waitingClaude': 'En attente de Claude…', 'tui.system': 'Système', 'tui.reset': 'Chambre réinitialisée.',
  'tui.creates': 'crée {name} ({role}) : {task}', 'tui.report': 'rapport : {text}', 'tui.reportBubble': 'Rapport : {text}',
  'tui.errorLog': 'erreur : {text}', 'tui.mission': 'mission accomplie', 'tui.tool': 'outil',
  'tui.st.whiteboard': 'planifie', 'tui.st.library': 'lit', 'tui.st.code': 'code', 'tui.st.bench': 'teste',
  'tui.st.lounge': 'en pause', 'tui.st.handoff': 'fait son rapport', 'tui.st.spawn': 'arrive',
  'tui.world.0': 'Studio dev', 'tui.world.1': 'Opéra', 'tui.world.2': 'Jardin', 'tui.world.3': 'Salle de classe'
};

const en = {
  help: `
  🛋️  claude-agent-room v{version}
  Real-time viewer of Claude and its subagents, in pixel art.

  Usage:
    claude-agent-room setup               install everything at once (guided wizard)
    claude-agent-room                     start the room (http://localhost:3030)
    claude-agent-room --open              … and open it in the browser
    claude-agent-room hooks install       connect Claude Code (~/.claude/settings.json)
    claude-agent-room hooks install --project   … for the current project only
    claude-agent-room hooks remove        disconnect Claude Code
    claude-agent-room hooks status        tell whether the hooks are installed
    claude-agent-room demo                run the demo in the open room
    claude-agent-room watch [path]        follow a transcript instead of hooks
    claude-agent-room tui                 the room in the terminal (starts the server if needed)
    claude-agent-room advisor             vetted tools to save tokens
    claude-agent-room advisor apply essentiel   … install them (with repository checks)
    claude-agent-room doctor              check the whole installation

  Options:
    --port <n>      server port (default 3030, or PORT / AGENT_ROOM_PORT)
    --host <ip>     listen address (default 127.0.0.1; 0.0.0.0 = local network, token required)
    --open          open the browser on start
    --lang fr|en    message language (or AGENT_ROOM_LANG)
    -v, --version   print the version
`,
  'cli.unknownCommand': '✖ Unknown command: {cmd}',
  'cli.unknownHooks': '✖ Unknown action: hooks {action} (install, remove or status)',
  'cli.demoStarted': '🎬 Demo started: {steps} steps, ~{seconds} s. Watch the room!',
  'cli.demoUnreachable': `✖ Can't reach the room at {base} ({why}). Start it first: ${CMD}`,
  'yesNo.yes': '[Y/n]', 'yesNo.no': '[y/N]',
  'setup.title': 'claude-agent-room v{version} — guided setup',
  'setup.hooks': 'Connect Claude Code to the room? (hooks in ~/.claude/settings.json, backed up first)',
  'setup.hooksLater': '→ Later: claude-agent-room hooks install',
  'setup.advisor': 'At the start of each new project, should Claude offer vetted tools that save tokens?',
  'setup.rules': 'Add the token-saving rules to the CLAUDE.md of {dir} now?',
  'setup.rulesAdded': '✅ Rules added to {file}',
  'setup.pro': 'Use the "pro" mood (sober, no shotgun)? No = fun mood',
  'setup.moodSaved': '✅ {mood} mood saved (you can change it in the page).',
  'setup.ready': 'All set. Restart Claude Code to load the hooks.',
  'doctor.title': 'claude-agent-room v{version} diagnostics',
  'doctor.nodeOld': 'Node.js {version} is too old',
  'doctor.nodeFix': 'Install Node 18 or newer: https://nodejs.org',
  'doctor.depOk': 'Dependency {dep} present',
  'doctor.depMissing': 'Dependency {dep} missing',
  'doctor.depFix': 'Run npm install in the project folder',
  'doctor.serverOk': 'Server reachable at {base} (v{version}{auth})',
  'doctor.tokenRequired': ', token required',
  'doctor.otherProgram': 'Another program is answering on port {port}',
  'doctor.otherProgramFix': 'Pick another port with --port and AGENT_ROOM_PORT',
  'doctor.serverDown': 'Server unreachable at {base}',
  'doctor.serverDownFix': `Start the room in another terminal: ${CMD}`,
  'doctor.scope.global': 'global', 'doctor.scope.project': 'project',
  'doctor.hooksOk': '{scope} hooks installed ({found}/{total}) in {file}',
  'doctor.hooksLegacy': `The {scope} hooks point to an old copy of the script → run again: ${CMD} hooks install{flag}`,
  'doctor.badJson': '{file} is not valid JSON ({why})',
  'doctor.badJsonFix': "Fix this file: Claude Code won't be able to read it either",
  'doctor.noHooks': `No hooks installed: the room will only get the demo. → ${CMD} hooks install`,
  'doctor.scriptOk': 'Hook script up to date ({file})',
  'doctor.scriptOld': `Installed hook script is outdated → run again: ${CMD} hooks install`,
  'doctor.scriptMissing': 'Hooks declared but script not found',
  'doctor.scriptMissingFix': `Run again: ${CMD} hooks install`,
  'doctor.pingMessage': '🩺 Diagnostics: the bridge works!',
  'doctor.pingOk': 'Test event sent: a bubble should appear above Claude',
  'doctor.pingFail': 'Sending an event was refused ({why})',
  'doctor.pingTokenFix': 'Export AGENT_ROOM_TOKEN with the token printed by the server',
  'doctor.problems': '{n} problem(s) to fix.',
  'doctor.allGood': 'All set. Give Claude a task that uses subagents!',
  'hooks.badJson': '{file} is not valid JSON ({why}). Fix it before running again.',
  'hooks.jsonObject': 'JSON object expected',
  'hooks.installedIn': '✅ Hooks installed in {file} ({events})',
  'hooks.none': '○ No claude-agent-room hooks in {file}',
  'hooks.script': '   Script: {file}',
  'hooks.scriptMissing': '   Hook script missing from ~/.claude/agent-room/',
  'hooks.backup': '💾 Backup: {file}',
  'hooks.removed': '🧹 claude-agent-room hooks removed from {file}',
  'hooks.installed': '✅ Hooks installed in {file}',
  'hooks.command': '   Command: {cmd}',
  'hooks.events': '   Events:  {events}',
  'hooks.next1': '   1) Start the room: npm start   (http://localhost:3030)',
  'hooks.next2': '   2) Restart Claude Code (or /hooks to check) and give it a task that uses subagents.',
  'server.alreadyRunning': '🛋️  The room is already running → {url}',
  'server.portBusy': '✖ Port {port} is already used by another program.',
  'server.portBusyFix': `  Pick another one: ${CMD} --port 3031  (and AGENT_ROOM_PORT=3031 for the hook)`,
  'server.portDenied': '✖ Access to port {port} denied. Try a port above 1024.',
  'server.online': '🛋️  Claude Agent Room v{version} is live → {url}',
  'server.events': '📡 Events: POST {base}/api/event   |   WebSocket ws://localhost:{port}/ws',
  'server.demo': `🎬 Demo:   ${CMD} demo   (or the button in the page)`,
  'server.exposed': '⚠️  Server exposed on the network ({host}). A token is required for the API and the WebSocket.',
  'server.tokenGenerated': '   Token generated for this session: {token}',
  'server.hookHint': '   For the hook: AGENT_ROOM_TOKEN=<token> and AGENT_ROOM_URL=http://<this-machine>:{port}/api/event',
  'server.stop': 'Ctrl+C to stop.',
  'watch.following': '👀 Following {target} → {endpoint}',
  'watch.none': 'No transcript found. Usage: node bridge/claude-hook.js --jsonl <file.jsonl|folder>',
  'adv.title': '💡 Token advisor — catalog reviewed on {date}',
  'adv.packEssential': 'Essential pack (website, small app):',
  'adv.packBig': 'For a big repository:',
  'adv.rejected': 'Rejected after review:',
  'adv.auto': 'Automatic offer at the start of a project: {state} ({n} project(s) already seen)',
  'adv.on': 'on', 'adv.off': 'off',
  'adv.hint': 'Install: claude-agent-room advisor apply essentiel   ·   Check the repos: claude-agent-room advisor check',
  'adv.unknown': 'Unknown tool: "{id}". Only tools from the vetted catalog are accepted (claude-agent-room advisor).',
  'adv.unknownAction': 'Unknown action: advisor {action} (list, show, check, apply, on, off, reset)',
  'adv.show.head': '{name}  (https://github.com/{repo}, license {license}, ★ {stars})',
  'adv.show.best': 'Best for: {text}', 'adv.show.gain': 'Gain: {text}',
  'adv.show.facts': 'Runs code: {code} · Network: {net} · Reviewed commit: {sha}',
  'adv.yes': 'yes', 'adv.no': 'no',
  'adv.show.install': 'Install:',
  'adv.show.inClaude': 'In Claude Code: {cmd}', 'adv.show.inShell': 'From a shell  : {cmd}',
  'adv.show.rules': 'claude-agent-room advisor apply rules   (in the project folder)',
  'adv.rulesAdded': '✅ Rules added to {file}',
  'adv.checkFailed': "⚠ Couldn't check ({why}).",
  'adv.archived': '✖ Archived repository: install refused.',
  'adv.changed': '⚠ The repository changed since the review ({from} → {to}). Review the changes: {url}',
  'adv.installAnyway': 'Install anyway?',
  'adv.yesNo': '[y/N]',
  'adv.skipped': 'Skipped.',
  'adv.same': '✔ Repository identical to the reviewed version ({sha}), license {license}.',
  'adv.installed': '✅ Installed. It will be active the next time Claude Code starts.',
  'adv.installFailed': '✖ Install failed (see above).',
  'adv.typeInClaude': 'Type in Claude Code: {cmd}',
  'adv.checkTitle': '🔎 Checking the repositories (reviewed on {date})',
  'adv.checkArchived': 'ARCHIVED',
  'adv.checkLicense': 'license {from} → {to}',
  'adv.checkChanged': 'changed since {sha} ({url})',
  'adv.checkSame': 'identical to the reviewed version',
  'adv.checkError': "couldn't check ({why})",
  'adv.checkWarn': "A changed repository isn't necessarily dangerous: review the comparison link before installing.",
  'adv.checkOk': 'Everything matches.',
  'adv.enabled': '✅ Claude will offer the tools at the start of each new project.',
  'adv.disabled': "🔕 Claude won't offer the token-saving tools anymore.",
  'adv.reset': '↺ Claude will ask again the next time it starts in each project.',
  'tui.needTty': '✖ The terminal mode needs a real terminal (stdout is not a TTY).',
  'tui.keys': 'q quit · d demo · r clear · w world',
  'tui.live': 'Live', 'tui.connecting': 'Connecting…', 'tui.lost': 'Connection lost, retrying…',
  'tui.unreachable': 'Server unreachable at {base} (start the room)', 'tui.token': 'Token required (AGENT_ROOM_TOKEN)',
  'tui.refused': 'Refused ({code})', 'tui.claude': 'Claude Code connected',
  'tui.alertWaiting': '⏳ Claude is waiting for you', 'tui.alertDone': '✅ Claude is done',
  'tui.agents': 'Agents', 'tui.working': '{n} working · {m} on a break', 'tui.orchestrates': 'orchestrating',
  'tui.noAgents': 'No subagents yet.', 'tui.error': 'error', 'tui.done': 'done',
  'tui.plan': 'Plan', 'tui.files': 'Files changed', 'tui.none': 'none', 'tui.log': 'Log',
  'tui.waitingClaude': 'Waiting for Claude…', 'tui.system': 'System', 'tui.reset': 'Room cleared.',
  'tui.creates': 'creates {name} ({role}): {task}', 'tui.report': 'report: {text}', 'tui.reportBubble': 'Report: {text}',
  'tui.errorLog': 'error: {text}', 'tui.mission': 'mission accomplished', 'tui.tool': 'tool',
  'tui.st.whiteboard': 'planning', 'tui.st.library': 'reading', 'tui.st.code': 'coding', 'tui.st.bench': 'testing',
  'tui.st.lounge': 'on a break', 'tui.st.handoff': 'reporting', 'tui.st.spawn': 'arriving',
  'tui.world.0': 'Dev studio', 'tui.world.1': 'Opera', 'tui.world.2': 'Garden', 'tui.world.3': 'Classroom'
};

const DICT = { fr, en };
const lang = detect();

function t(key, vars) {
  let s = DICT[lang][key] ?? fr[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

/** Champ traduit d'un objet du catalogue : obj.en[champ] en anglais, sinon obj[champ]. */
function field(obj, name) {
  return lang !== 'fr' && obj && obj[lang] && obj[lang][name] != null ? obj[lang][name] : obj[name];
}

module.exports = { t, lang, detect, field, DICT };
