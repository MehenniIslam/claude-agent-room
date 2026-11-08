/*
 * Textes de l'interface, en français et en anglais.
 *
 *   I18N.t('cle', { var })   texte traduit, avec {var} remplacé
 *   I18N.list('cle')         liste traduite (répliques, blagues…)
 *   I18N.lang                'fr' ou 'en' : ?lang=, sinon choix mémorisé, sinon langue du navigateur
 *   I18N.apply(document)     traduit les éléments marqués data-i18n, data-i18n-title, data-i18n-aria
 *   I18N.msg(event)          message d'un événement dans la langue de la page (clé `msg` du serveur,
 *                            version `en` de la démo, sinon le texte d'origine)
 *
 * Pour ajouter une langue : copier le bloc `en`, traduire, et l'ajouter au menu dans index.html.
 */
(function (root) {
  'use strict';

  const fr = {
    // en-tête
    'tagline': 'orchestrateur & sous-agents, en direct',
    'status.title': 'État de la connexion',
    'status.connecting': 'Connexion…',
    'status.live': 'En direct',
    'status.demo': 'Mode démo',
    'status.auth': 'Jeton requis',
    'status.tip.auth': "Le serveur exige un jeton : ouvre l'URL affichée dans le terminal (…/?token=…)",
    'status.tip.demo': 'Serveur injoignable : la chambre rejoue la démo localement',
    'status.tip.live': 'Connecté au serveur',
    'status.claude': 'Claude Code branché',
    'status.waiting': 'en attente de Claude',
    'counter.agents': 'Agents actifs',
    'counter.tools': 'Outils',
    'counter.events': 'Événements',
    'counter.cost': 'Coût estimé',
    'counter.cost.tip': "Estimation au tarif public de l'API Anthropic (un abonnement Pro/Max ne facture pas au token)",
    'picker.world': 'Monde',
    'picker.mood': 'Ambiance',
    'picker.ending': 'Fin des agents',
    'picker.lang': 'Langue',
    'mood.fun': '🎉 Fun',
    'mood.pro': '💼 Pro',
    'ending.pompe': '💥 À la pompe',
    'ending.cafe': '☕ Pause café',
    'btn.demo.long': 'Lancer la ',
    'btn.demo': 'démo',
    'btn.demo.tip': 'Lancer la démo (D)',
    'btn.spawn.long': 'Tester un ',
    'btn.spawn': 'spawn',
    'btn.spawn.tip': 'Faire apparaître un agent de test (S)',
    'btn.notify.tip': 'Prévenir quand Claude a fini ou attend ta réponse (N)',
    'btn.reset.tip': 'Vider la chambre (R)',
    'btn.fullscreen.tip': 'Plein écran (F)',
    'btn.help.tip': 'Aide et raccourcis (?)',
    'skip': 'Aller au journal',
    // accueil
    'onb.title': 'La chambre est calme.',
    'onb.text': 'Regarde une mission complète, ou branche Claude Code pour voir tes vrais agents.',
    'onb.demo.title': 'Voir la démo',
    'onb.demo.text': '5 sous-agents, un test qui échoue, une correction. Aucun token consommé.',
    'onb.demo.btn': '▶ Lancer la démo',
    'onb.connect.title': 'Brancher Claude Code',
    'onb.connect.text': 'Dans un autre terminal :',
    'onb.connect.after': 'Puis relance Claude Code et demande une tâche avec des sous-agents.',
    'onb.hide': 'Masquer',
    'copy': 'Copier',
    'copied': 'Copié ✓',
    'copy.fail': 'Copie impossible : sélectionne la commande à la main.',
    // panneau
    'panel.tree': 'Hiérarchie',
    'tab.log': 'Journal',
    'tab.tasks': 'Tâches',
    'tab.files': 'Fichiers',
    'btn.export': 'exporter',
    'btn.export.tip': 'Télécharger le journal du jour (JSON ou CSV)',
    'btn.clear': 'effacer',
    'filter.all': 'Tout',
    'filter.tools': 'Outils',
    'filter.msg': 'Messages',
    'filter.err': 'Erreurs',
    'tree.empty': 'Aucun sous-agent pour le moment.',
    'files.empty': 'Aucun fichier touché pour le moment.',
    'files.left': 'parti',
    'files.tip': '{path} · {action} {count} fois',
    'file.w': 'écrit',
    'file.e': 'modifié',
    'file.r': 'lu',
    'tasks.empty': "Le plan de Claude s'affichera ici dès qu'il fera une liste de tâches.",
    'tasks.done': 'Tout est fait ({n} tâches).',
    'tasks.progress': '{done} sur {total} faites',
    'tasks.current': ' · en cours : {task}',
    'plan.label': 'Plan {done}/{total}',
    // fiche agent
    'inspector.prompt': 'Prompt initial',
    'inspector.files': 'Fichiers touchés',
    'inspector.history': 'Historique des actions',
    'inspector.close': 'Fermer la fiche',
    'inspector.none': 'aucun pour le moment',
    'inspector.since': '{status} · depuis {time}',
    'inspector.cost': ' · {tokens} tokens · ~{cost}',
    'inspector.main': 'Orchestrateur principal. {n} sous-agent(s) dans la chambre.',
    'inspector.noPrompt': '(aucun prompt transmis)',
    // statuts
    'st.spawning': 'Arrive…', 'st.walking': 'En marche', 'st.coding': 'Écrit du code', 'st.reading': 'Lit un fichier',
    'st.planning': 'Planifie au tableau', 'st.bash': 'Lance des commandes', 'st.coffee': 'En pause', 'st.idle': 'En pause',
    'st.handoff': 'Remet son rapport', 'st.done': 'Terminé', 'st.orchestrating': 'Orchestre', 'st.error': 'Erreur',
    'role.main': 'Orchestrateur',
    'st.gone': 'Parti', 'st.retired': '💥 Retiré', 'st.retiring': 'Va être retiré…', 'st.doneCoffee': 'Terminé · café',
    // bulles et journal
    'say.spawn': 'Je crée {name} pour : {task}',
    'say.ack': "Bien reçu chef, je m'en occupe !",
    'say.report': 'Rapport : {report}',
    'say.thanks': 'Merci {name}, beau travail !',
    'say.error': 'Erreur !',
    'say.waiting': "J'attends ta réponse.",
    'say.done': "J'ai terminé.",
    'task.default': 'une nouvelle tâche',
    'tool.generic': 'Outil {tool}',
    'tool.word': 'outil',
    'tool.finished': '{tool} terminé',
    'rec.created': 'Créé pour : {task}',
    'rec.creates': 'Crée {name} ({role})',
    'rec.report': 'Rapport : {report}',
    'rec.reportOf': 'Rapport de {name}',
    'rec.error': 'Erreur : {message}',
    'rec.retired': 'Retiré du service à la pompe',
    'log.spawn': 'crée {name} · {role} → {task}',
    'log.done': 'Terminé',
    'log.error': 'Erreur',
    'log.unknown': 'Événement inconnu : {type}',
    'log.retired': '💥 retiré du service à la pompe',
    'log.system': 'Système',
    'log.reset': 'Chambre réinitialisée.',
    'log.replayed': '{n} événement(s) récents rejoués.',
    'missionDone': 'Mission accomplie.',
    // notifications
    'notify.waiting.toast': '⏳ Claude attend ta réponse : {text}',
    'notify.done.toast': '✅ Claude a terminé.',
    'notify.waiting.title': 'Claude attend',
    'notify.done.title': 'Claude a fini',
    'notify.waiting.os': 'Claude attend ta réponse',
    'notify.done.os': 'Claude a terminé',
    'notify.on': '🔔 Tu seras prévenu quand Claude finit ou attend ta réponse.',
    'notify.off': '🔕 Notifications coupées.',
    'toast.reconnected': 'Reconnecté au serveur.',
    'toast.lost': 'Connexion perdue, nouvel essai…',
    'toast.needToken': "Ce serveur exige un jeton : ouvre l'URL avec ?token=… affichée dans le terminal.",
    'toast.fullscreen': 'Plein écran indisponible ici.',
    'toast.world': 'Monde : {name}',
    // coût
    'cost.tip': "{tokens} tokens (entrée {input}, sortie {output}, cache lu {read}, cache écrit {write}) · estimation au tarif public de l'API",
    // diff
    'diff.meta': '{action} par {name} · +{added} −{removed} · {count} action(s)',
    'diff.someone': 'un agent parti',
    'diff.readOnly': 'Fichier seulement lu : aucun changement.',
    'diff.none': 'Aucun aperçu disponible pour ce changement.',
    'close': 'Fermer',
    // export
    'export.title': 'Exporter le journal',
    'export.text': 'Le journal est gardé sur ta machine (~/.claude/agent-room/history/), secrets déjà masqués. Choisis un jour :',
    'export.disabled': 'journal sur disque désactivé (AGENT_ROOM_HISTORY=0)',
    'export.empty': 'aucun événement enregistré pour le moment',
    'export.unavailable': 'Export indisponible : {why}.',
    'export.demo': 'Export indisponible en mode démo (serveur non joint).',
    'export.fail': 'Export impossible : {why}',
    // aide
    'help.title': 'Aide',
    'help.close': "Fermer l'aide",
    'help.keys': 'Raccourcis clavier',
    'key.demo': 'Lancer la démo', 'key.spawn': 'Agent de test', 'key.reset': 'Vider la chambre', 'key.world': 'Monde suivant',
    'key.fullscreen': 'Plein écran', 'key.notify': 'Notifications oui / non', 'key.close': 'Fermer la fiche', 'key.esc': 'Échap',
    'help.tokens': 'Économiser des tokens',
    'help.tokens.text': "Au début d'un nouveau projet, Claude te propose une sélection d'outils vérifiés (règles CLAUDE.md, Caveman, Context7…). Liste, gains mesurés et risques :",
    'help.connect': 'Brancher Claude Code',
    'help.step1': 'Laisse cette page ouverte (le serveur doit tourner).',
    'help.step2': 'Dans un autre terminal :',
    'help.step3': 'Relance Claude Code, tape /hooks pour vérifier.',
    'help.step4': 'Un souci ? Cette commande vérifie tout :',
    'help.privacy': 'Confidentialité',
    'help.privacy.text': "Tout reste sur ta machine. Le serveur n'écoute que 127.0.0.1, refuse les autres sites, et masque les clés API, tokens et mots de passe repérés avant de les afficher.",
    // agents de test
    'test.prompt': 'Mission de test : {task}.',
    'test.cmdDone': 'commande terminée',
    'test.done': 'Fini : {task}.',
    'test.tasks': ['explorer les dépendances obsolètes', 'refactorer le composant Navbar', 'lancer la suite de tests e2e', 'découper le monolithe en modules', 'relire la PR #42', 'traquer la fuite mémoire du worker'],
    // répliques
    'smallTalk': ['Ce café est parfait.', 'Tu as vu le diff ? Propre.', 'Je recharge les batteries.', 'Les tests sont verts, je savoure.', 'Pause bien méritée !', "Quelqu'un a nommé une variable data2…", 'Le chef va nous rappeler, je le sens.', "J'ai lu 40 fichiers aujourd'hui.", 'Le chat a encore piqué le coussin.'],
    'replies': ['Carrément.', 'Haha, classique.', 'Pareil !', 'Bien joué.', 'Chut, le chat dort.', 'On en reparle au prochain sprint.'],
    'execLines': ['Merci pour tes services, {name}.', '{name}, ton contexte est clos.', 'Fin de mission, {name}. Adieu.', "On n'a plus besoin de toi, {name} !", '{name}, tu as bien travaillé. Désolé.'],
    'ghostLines': ['Adieu monde cruel…', "J'avais encore des tokens…", 'Au moins mes tests passent.', 'Je reviendrai… en sous-agent.', 'Pensez à commit mon travail !'],
    // messages générés par le serveur (clé `msg`)
    'msg.read': 'Je lis {file}', 'msg.write': "J'écris {file}", 'msg.edit': 'Je modifie {file}', 'msg.aFile': 'un fichier',
    'msg.grep': 'grep "{pattern}"', 'msg.grepIn': 'grep "{pattern}" dans {path}', 'msg.glob': 'Je cherche {pattern}',
    'msg.webSearch': 'Recherche web : {query}', 'msg.webFetch': 'Je consulte {url}', 'msg.todo': 'Je mets à jour la liste de tâches',
    'msg.tool': 'Outil {tool}', 'msg.newRequest': 'Nouvelle demande : {text}', 'msg.turnDone': "J'ai terminé, à toi de jouer !",
    'msg.waiting': "J'attends ta réponse.", 'msg.missionDone': 'Mission terminée.', 'msg.failed': '{tool} a échoué : {why}',
    'msg.failure': 'Échec', 'msg.subagentFailed': 'Échec du sous-agent'
  };

  const en = {
    'tagline': 'orchestrator & subagents, live',
    'status.title': 'Connection status',
    'status.connecting': 'Connecting…',
    'status.live': 'Live',
    'status.demo': 'Demo mode',
    'status.auth': 'Token required',
    'status.tip.auth': 'The server requires a token: open the URL printed in the terminal (…/?token=…)',
    'status.tip.demo': 'Server unreachable: the room is replaying the demo locally',
    'status.tip.live': 'Connected to the server',
    'status.claude': 'Claude Code connected',
    'status.waiting': 'waiting for Claude',
    'counter.agents': 'Active agents',
    'counter.tools': 'Tools',
    'counter.events': 'Events',
    'counter.cost': 'Est. cost',
    'counter.cost.tip': "Estimated at Anthropic's public API rates (a Pro/Max plan isn't billed per token)",
    'picker.world': 'World',
    'picker.mood': 'Mood',
    'picker.ending': 'Agent ending',
    'picker.lang': 'Language',
    'mood.fun': '🎉 Fun',
    'mood.pro': '💼 Pro',
    'ending.pompe': '💥 Shotgun',
    'ending.cafe': '☕ Coffee break',
    'btn.demo.long': 'Run the ',
    'btn.demo': 'demo',
    'btn.demo.tip': 'Run the demo (D)',
    'btn.spawn.long': 'Test a ',
    'btn.spawn': 'spawn',
    'btn.spawn.tip': 'Spawn a test agent (S)',
    'btn.notify.tip': 'Notify me when Claude finishes or waits for my answer (N)',
    'btn.reset.tip': 'Clear the room (R)',
    'btn.fullscreen.tip': 'Fullscreen (F)',
    'btn.help.tip': 'Help and shortcuts (?)',
    'skip': 'Skip to the log',
    'onb.title': 'The room is quiet.',
    'onb.text': 'Watch a full mission, or connect Claude Code to see your real agents.',
    'onb.demo.title': 'Watch the demo',
    'onb.demo.text': '5 subagents, a failing test, a fix. No tokens spent.',
    'onb.demo.btn': '▶ Run the demo',
    'onb.connect.title': 'Connect Claude Code',
    'onb.connect.text': 'In another terminal:',
    'onb.connect.after': 'Then restart Claude Code and ask for a task that uses subagents.',
    'onb.hide': 'Hide',
    'copy': 'Copy',
    'copied': 'Copied ✓',
    'copy.fail': "Couldn't copy: select the command by hand.",
    'panel.tree': 'Hierarchy',
    'tab.log': 'Log',
    'tab.tasks': 'Tasks',
    'tab.files': 'Files',
    'btn.export': 'export',
    'btn.export.tip': "Download today's log (JSON or CSV)",
    'btn.clear': 'clear',
    'filter.all': 'All',
    'filter.tools': 'Tools',
    'filter.msg': 'Messages',
    'filter.err': 'Errors',
    'tree.empty': 'No subagents yet.',
    'files.empty': 'No files touched yet.',
    'files.left': 'gone',
    'files.tip': '{path} · {action} {count} time(s)',
    'file.w': 'written',
    'file.e': 'edited',
    'file.r': 'read',
    'tasks.empty': "Claude's plan will show up here as soon as it makes a task list.",
    'tasks.done': 'All done ({n} tasks).',
    'tasks.progress': '{done} of {total} done',
    'tasks.current': ' · in progress: {task}',
    'plan.label': 'Plan {done}/{total}',
    'inspector.prompt': 'Initial prompt',
    'inspector.files': 'Files touched',
    'inspector.history': 'Action history',
    'inspector.close': 'Close the card',
    'inspector.none': 'none yet',
    'inspector.since': '{status} · since {time}',
    'inspector.cost': ' · {tokens} tokens · ~{cost}',
    'inspector.main': 'Main orchestrator. {n} subagent(s) in the room.',
    'inspector.noPrompt': '(no prompt received)',
    'st.spawning': 'Arriving…', 'st.walking': 'Walking', 'st.coding': 'Writing code', 'st.reading': 'Reading a file',
    'st.planning': 'Planning at the board', 'st.bash': 'Running commands', 'st.coffee': 'On a break', 'st.idle': 'On a break',
    'st.handoff': 'Handing in the report', 'st.done': 'Done', 'st.orchestrating': 'Orchestrating', 'st.error': 'Error',
    'role.main': 'Orchestrator',
    'st.gone': 'Gone', 'st.retired': '💥 Retired', 'st.retiring': 'About to be retired…', 'st.doneCoffee': 'Done · coffee',
    'say.spawn': 'Creating {name} to: {task}',
    'say.ack': "Got it, boss, I'm on it!",
    'say.report': 'Report: {report}',
    'say.thanks': 'Thanks {name}, great job!',
    'say.error': 'Error!',
    'say.waiting': 'Waiting for your answer.',
    'say.done': "I'm done.",
    'task.default': 'a new task',
    'tool.generic': 'Tool {tool}',
    'tool.word': 'tool',
    'tool.finished': '{tool} finished',
    'rec.created': 'Created to: {task}',
    'rec.creates': 'Creates {name} ({role})',
    'rec.report': 'Report: {report}',
    'rec.reportOf': 'Report from {name}',
    'rec.error': 'Error: {message}',
    'rec.retired': 'Retired by shotgun',
    'log.spawn': 'creates {name} · {role} → {task}',
    'log.done': 'Done',
    'log.error': 'Error',
    'log.unknown': 'Unknown event: {type}',
    'log.retired': '💥 retired by shotgun',
    'log.system': 'System',
    'log.reset': 'Room cleared.',
    'log.replayed': '{n} recent event(s) replayed.',
    'missionDone': 'Mission accomplished.',
    'notify.waiting.toast': '⏳ Claude is waiting for your answer: {text}',
    'notify.done.toast': '✅ Claude is done.',
    'notify.waiting.title': 'Claude is waiting',
    'notify.done.title': 'Claude is done',
    'notify.waiting.os': 'Claude is waiting for your answer',
    'notify.done.os': 'Claude is done',
    'notify.on': "🔔 You'll be notified when Claude finishes or waits for your answer.",
    'notify.off': '🔕 Notifications off.',
    'toast.reconnected': 'Reconnected to the server.',
    'toast.lost': 'Connection lost, retrying…',
    'toast.needToken': 'This server requires a token: open the URL with ?token=… printed in the terminal.',
    'toast.fullscreen': 'Fullscreen is not available here.',
    'toast.world': 'World: {name}',
    'cost.tip': "{tokens} tokens (input {input}, output {output}, cache read {read}, cache write {write}) · estimated at Anthropic's public API rates",
    'diff.meta': '{action} by {name} · +{added} −{removed} · {count} action(s)',
    'diff.someone': 'an agent who left',
    'diff.readOnly': 'File only read: no changes.',
    'diff.none': 'No preview available for this change.',
    'close': 'Close',
    'export.title': 'Export the log',
    'export.text': 'The log stays on your machine (~/.claude/agent-room/history/), secrets already masked. Pick a day:',
    'export.disabled': 'on-disk log disabled (AGENT_ROOM_HISTORY=0)',
    'export.empty': 'no events recorded yet',
    'export.unavailable': 'Export unavailable: {why}.',
    'export.demo': 'Export unavailable in demo mode (server not reachable).',
    'export.fail': 'Export failed: {why}',
    'help.title': 'Help',
    'help.close': 'Close help',
    'help.keys': 'Keyboard shortcuts',
    'key.demo': 'Run the demo', 'key.spawn': 'Test agent', 'key.reset': 'Clear the room', 'key.world': 'Next world',
    'key.fullscreen': 'Fullscreen', 'key.notify': 'Notifications on / off', 'key.close': 'Close the card', 'key.esc': 'Esc',
    'help.tokens': 'Save tokens',
    'help.tokens.text': 'At the start of a new project, Claude offers a selection of vetted tools (CLAUDE.md rules, Caveman, Context7…). List, measured gains and risks:',
    'help.connect': 'Connect Claude Code',
    'help.step1': 'Keep this page open (the server must be running).',
    'help.step2': 'In another terminal:',
    'help.step3': 'Restart Claude Code, type /hooks to check.',
    'help.step4': 'Something wrong? This command checks everything:',
    'help.privacy': 'Privacy',
    'help.privacy.text': 'Everything stays on your machine. The server only listens on 127.0.0.1, refuses other websites, and masks the API keys, tokens and passwords it spots before displaying anything.',
    'test.prompt': 'Test mission: {task}.',
    'test.cmdDone': 'command finished',
    'test.done': 'Done: {task}.',
    'test.tasks': ['explore outdated dependencies', 'refactor the Navbar component', 'run the e2e test suite', 'split the monolith into modules', 'review PR #42', 'hunt down the worker memory leak'],
    'smallTalk': ['This coffee is perfect.', 'Did you see that diff? Clean.', 'Recharging my batteries.', 'Tests are green, savoring it.', 'Well-deserved break!', 'Someone named a variable data2…', "The boss will call us back, I can feel it.", 'I read 40 files today.', 'The cat stole the cushion again.'],
    'replies': ['Totally.', 'Haha, classic.', 'Same!', 'Nice one.', 'Shh, the cat is sleeping.', "Let's discuss it next sprint."],
    'execLines': ['Thanks for your service, {name}.', '{name}, your context is closed.', 'Mission over, {name}. Farewell.', "We don't need you anymore, {name}!", '{name}, you did great. Sorry.'],
    'ghostLines': ['Farewell, cruel world…', 'I still had tokens left…', 'At least my tests pass.', "I'll be back… as a subagent.", 'Remember to commit my work!'],
    'msg.read': 'Reading {file}', 'msg.write': 'Writing {file}', 'msg.edit': 'Editing {file}', 'msg.aFile': 'a file',
    'msg.grep': 'grep "{pattern}"', 'msg.grepIn': 'grep "{pattern}" in {path}', 'msg.glob': 'Looking for {pattern}',
    'msg.webSearch': 'Web search: {query}', 'msg.webFetch': 'Opening {url}', 'msg.todo': 'Updating the task list',
    'msg.tool': 'Tool {tool}', 'msg.newRequest': 'New request: {text}', 'msg.turnDone': 'Done — your turn!',
    'msg.waiting': 'Waiting for your answer.', 'msg.missionDone': 'Mission complete.', 'msg.failed': '{tool} failed: {why}',
    'msg.failure': 'Failed', 'msg.subagentFailed': 'Subagent failed'
  };

  const DICT = { fr, en };
  const LANGS = Object.keys(DICT);

  function detect() {
    try {
      const q = new URLSearchParams(root.location ? root.location.search : '').get('lang');
      if (q && DICT[q]) return q;
    } catch { /* pas d'URL */ }
    try {
      const saved = root.localStorage && root.localStorage.getItem('agent-room:lang');
      if (saved && DICT[saved]) return saved;
    } catch { /* stockage indisponible */ }
    const nav = (root.navigator && (root.navigator.language || '')) || '';
    return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  const api = {
    lang: detect(),
    langs: LANGS,
    dict: DICT,
    t(key, vars) {
      const d = DICT[api.lang];
      let s = d[key] != null ? d[key] : fr[key] != null ? fr[key] : key;
      if (Array.isArray(s)) return s.join(' ');
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
      return s;
    },
    list(key) {
      const v = DICT[api.lang][key] || fr[key];
      return Array.isArray(v) ? v : [];
    },
    set(lang) {
      if (!DICT[lang]) return;
      try { root.localStorage.setItem('agent-room:lang', lang); } catch { /* stockage indisponible */ }
    },
    /** Message affichable d'un événement, dans la langue de la page. */
    msg(e) {
      if (!e) return '';
      if (e.msg && e.msg.k && DICT[api.lang][`msg.${e.msg.k}`]) {
        const a = { ...(e.msg.a || {}) };
        if (a.file === '') a.file = api.t('msg.aFile');
        return api.t(`msg.${e.msg.k}`, a);
      }
      if (api.lang !== 'fr' && e[api.lang] && e[api.lang].message) return e[api.lang].message;
      return e.message || '';
    },
    prompt(e) {
      if (api.lang !== 'fr' && e && e[api.lang] && e[api.lang].prompt) return e[api.lang].prompt;
      return (e && e.prompt) || '';
    },
    todos(e) {
      if (api.lang !== 'fr' && e && e[api.lang] && Array.isArray(e[api.lang].todos)) return e[api.lang].todos;
      return e && e.todos;
    },
    /** Traduit les éléments statiques de la page. */
    apply(doc) {
      doc.documentElement.lang = api.lang;
      doc.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = api.t(el.dataset.i18n); });
      doc.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = api.t(el.dataset.i18nTitle); });
      doc.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', api.t(el.dataset.i18nAria)); });
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof window !== 'undefined' ? window : globalThis);
