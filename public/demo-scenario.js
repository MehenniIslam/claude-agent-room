/*
 * Scénario de démonstration partagé par le serveur (POST /api/demo)
 * et par le navigateur (mode démo hors-ligne quand le serveur est absent).
 * Chaque étape : { at: millisecondes depuis le début, ...événement }.
 */
(function (root) {
  const M = 'claude-main';
  const steps = [
    { at: 0, type: 'AGENT_MESSAGE', agentId: M, message: "Nouvelle mission : ajouter la connexion OAuth (GitHub) à l'app et la couvrir de tests." },
    { at: 1400, type: 'TOOL_START', agentId: M, tool: 'TodoWrite', message: "Je découpe la mission en 5 tâches.", todos: [{"content":"Concevoir le flux OAuth","status":"in_progress"},{"content":"Cartographier le code d’auth","status":"pending"},{"content":"Bouton « Se connecter avec GitHub »","status":"pending"},{"content":"Routes /auth/login et /auth/callback","status":"pending"},{"content":"Tests du flux OAuth","status":"pending"}] },
    { at: 2600, type: 'SUBAGENT_SPAWN', agentId: 'sub-archi', parentId: M, role: 'Architect', name: 'Archi', message: 'concevoir le flux OAuth', prompt: "Conçois le flux OAuth GitHub (routes, stockage du token, session). Rends un plan court en 5 étapes." },
    { at: 5200, type: 'TOOL_START', agentId: 'sub-archi', tool: 'Task', message: 'Je pose le plan au tableau : /auth/login → GitHub → /auth/callback → session.' },
    { at: 6400, type: 'SUBAGENT_SPAWN', agentId: 'sub-research', parentId: M, role: 'Researcher', name: 'Biblio', message: "cartographier le code d'auth existant", prompt: "Trouve tout le code lié à l'authentification et aux sessions. Liste les fichiers et les points d'entrée." },
    { at: 9000, type: 'TOOL_START', agentId: 'sub-research', tool: 'Grep', file: 'src/', message: 'grep "session|auth" dans src/ …' },
    { at: 12500, type: 'TOOL_START', agentId: 'sub-research', tool: 'Read', file: 'src/auth.ts', message: "Je lis src/auth.ts : il n'y a qu'un login par mot de passe." },
    { at: 13800, type: 'AGENT_MESSAGE', agentId: 'sub-archi', targetAgentId: 'sub-research', message: 'Biblio, le middleware de session est où ?' },
    { at: 16200, type: 'AGENT_MESSAGE', agentId: 'sub-research', targetAgentId: 'sub-archi', message: 'Dans src/server/session.ts, basé sur express-session.' },
    { at: 18200, type: 'SUBAGENT_SPAWN', agentId: 'sub-front', parentId: M, role: 'Coder', name: 'Front', message: 'bouton "Se connecter avec GitHub"', prompt: 'Ajoute le bouton de connexion GitHub sur la page de login et gère le retour de callback.' },
    { at: 19400, type: 'SUBAGENT_SPAWN', agentId: 'sub-back', parentId: M, role: 'Coder', name: 'Back', message: 'routes /auth/login et /auth/callback', prompt: "Implémente les routes OAuth côté serveur, l'échange code → token et l'ouverture de session." },
    { at: 21800, type: 'TOOL_START', agentId: 'sub-research', tool: 'WebSearch', message: 'Je vérifie la doc GitHub OAuth : paramètre state obligatoire.' },
    { at: 22400, type: 'TOOL_START', agentId: M, tool: 'TodoWrite', message: "Plan à jour.", todos: [{"content":"Concevoir le flux OAuth","status":"completed"},{"content":"Cartographier le code d’auth","status":"in_progress"},{"content":"Bouton « Se connecter avec GitHub »","status":"in_progress"},{"content":"Routes /auth/login et /auth/callback","status":"in_progress"},{"content":"Tests du flux OAuth","status":"pending"}] },
    { at: 22600, type: 'SUBAGENT_COMPLETE', agentId: 'sub-archi', message: 'Plan prêt : 5 étapes, state anti-CSRF, token chiffré en session.' },
    { at: 23800, type: 'TOOL_START', agentId: 'sub-front', tool: 'Edit', file: 'src/pages/Login.tsx', message: 'Ajout du bouton GitHub dans Login.tsx', diff: "-<button>Se connecter</button>\n+<button>Se connecter</button>\n+<a className=\"btn-github\" href=\"/auth/login\">Se connecter avec GitHub</a>", added: 2, removed: 1 },
    { at: 25000, type: 'TOOL_START', agentId: 'sub-back', tool: 'Write', file: 'src/server/oauth.ts', message: 'Création de src/server/oauth.ts', diff: "+import { Router } from 'express';\n+export const oauth = Router();\n+oauth.get('/auth/login', (req, res) => {\n+  req.session.state = crypto.randomUUID();\n+  res.redirect(githubAuthorizeUrl(req.session.state));\n+});", added: 6, removed: 0 },
    { at: 28500, type: 'AGENT_MESSAGE', agentId: 'sub-front', targetAgentId: 'sub-back', message: "Back, l'URL de callback c'est bien /auth/callback ?" },
    { at: 30800, type: 'AGENT_MESSAGE', agentId: 'sub-back', targetAgentId: 'sub-front', message: 'Oui, avec ?code=…&state=… en query.' },
    { at: 31500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-research', message: '3 fichiers concernés : auth.ts, session.ts, Login.tsx. Doc GitHub résumée.' },
    { at: 33000, type: 'TOOL_START', agentId: 'sub-back', tool: 'Edit', file: 'src/server/session.ts', message: 'Je branche la session sur le token OAuth.' },
    { at: 34500, type: 'SUBAGENT_SPAWN', agentId: 'sub-test', parentId: M, role: 'Tester', name: 'QA', message: 'tester le flux OAuth de bout en bout', prompt: 'Écris et lance les tests du flux OAuth (succès, state invalide, refus utilisateur).' },
    { at: 37500, type: 'TOOL_START', agentId: 'sub-test', tool: 'Write', file: 'tests/oauth.test.ts', message: 'Écriture de tests/oauth.test.ts' },
    { at: 41500, type: 'TOOL_START', agentId: 'sub-test', tool: 'Bash', message: 'npm test -- oauth' },
    { at: 44500, type: 'TOOL_END', agentId: 'sub-test', tool: 'Bash', success: false, message: '1 test en échec : state invalide non rejeté' },
    { at: 44700, type: 'ERROR', agentId: 'sub-test', message: 'Le callback accepte un state invalide !' },
    { at: 46500, type: 'AGENT_MESSAGE', agentId: 'sub-test', targetAgentId: 'sub-back', message: 'Back, /auth/callback ne vérifie pas le state.' },
    { at: 48600, type: 'AGENT_MESSAGE', agentId: 'sub-back', targetAgentId: 'sub-test', message: 'Bien vu, je corrige tout de suite.' },
    { at: 49000, type: 'TOOL_START', agentId: 'sub-back', tool: 'Edit', file: 'src/server/oauth.ts', message: 'Comparaison stricte du state stocké en session.', diff: "-  const { code } = req.query;\n+  const { code, state } = req.query;\n+  if (!state || state !== req.session.state) return res.status(403).send('state invalide');", added: 2, removed: 1 },
    { at: 50300, type: 'TOOL_START', agentId: M, tool: 'TodoWrite', message: "Plan à jour.", todos: [{"content":"Concevoir le flux OAuth","status":"completed"},{"content":"Cartographier le code d’auth","status":"completed"},{"content":"Bouton « Se connecter avec GitHub »","status":"completed"},{"content":"Routes /auth/login et /auth/callback","status":"in_progress"},{"content":"Tests du flux OAuth","status":"in_progress"}] },
    { at: 50500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-front', message: 'Bouton GitHub + gestion du retour OK.' },
    { at: 53500, type: 'TOOL_START', agentId: 'sub-test', tool: 'Bash', message: 'npm test -- oauth (2e passage)' },
    { at: 56500, type: 'TOOL_END', agentId: 'sub-test', tool: 'Bash', success: true, message: '12 tests passent' },
    { at: 57500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-back', message: 'Routes OAuth en place, state vérifié, token chiffré.' },
    { at: 59500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-test', message: '12/12 tests verts, y compris le cas state invalide.' },
    { at: 62500, type: 'TOOL_START', agentId: M, tool: 'TodoWrite', message: "Tout est fait.", todos: [{"content":"Concevoir le flux OAuth","status":"completed"},{"content":"Cartographier le code d’auth","status":"completed"},{"content":"Bouton « Se connecter avec GitHub »","status":"completed"},{"content":"Routes /auth/login et /auth/callback","status":"completed"},{"content":"Tests du flux OAuth","status":"completed"}] },
    { at: 63500, type: 'AGENT_MESSAGE', agentId: M, message: "Mission terminée : OAuth GitHub livré et testé. Merci l'équipe !" },
    { at: 65000, type: 'NOTIFY', kind: 'done', agentId: M, message: "J'ai terminé, à toi de jouer !" }
  ];

  // Version anglaise : chaque étape reçoit un champ `en` (la page l'affiche quand elle est en anglais).
  const TASKS_EN = {
    'Concevoir le flux OAuth': 'Design the OAuth flow', 'Cartographier le code d’auth': 'Map the auth code',
    'Bouton « Se connecter avec GitHub »': '"Sign in with GitHub" button', 'Routes /auth/login et /auth/callback': '/auth/login and /auth/callback routes',
    'Tests du flux OAuth': 'OAuth flow tests'
  };
  const EN = {
    0: { message: 'New mission: add GitHub OAuth sign-in to the app and cover it with tests.' },
    1400: { message: 'Splitting the mission into 5 tasks.' },
    2600: { message: 'design the OAuth flow', prompt: 'Design the GitHub OAuth flow (routes, token storage, session). Return a short 5-step plan.' },
    5200: { message: 'Drawing the plan on the board: /auth/login → GitHub → /auth/callback → session.' },
    6400: { message: 'map the existing auth code', prompt: 'Find all the code related to authentication and sessions. List the files and entry points.' },
    9000: { message: 'grep "session|auth" in src/ …' },
    12500: { message: 'Reading src/auth.ts: there is only a password login.' },
    13800: { message: 'Biblio, where is the session middleware?' },
    16200: { message: 'In src/server/session.ts, based on express-session.' },
    18200: { message: '"Sign in with GitHub" button', prompt: 'Add the GitHub sign-in button to the login page and handle the callback return.' },
    19400: { message: '/auth/login and /auth/callback routes', prompt: 'Implement the server-side OAuth routes, the code → token exchange and the session opening.' },
    21800: { message: 'Checking the GitHub OAuth docs: the state parameter is required.' },
    22400: { message: 'Plan updated.' },
    22600: { message: 'Plan ready: 5 steps, anti-CSRF state, token encrypted in the session.' },
    23800: { message: 'Adding the GitHub button to Login.tsx' },
    25000: { message: 'Creating src/server/oauth.ts' },
    28500: { message: 'Back, the callback URL is /auth/callback, right?' },
    30800: { message: 'Yes, with ?code=…&state=… in the query.' },
    31500: { message: '3 files involved: auth.ts, session.ts, Login.tsx. GitHub docs summarized.' },
    33000: { message: 'Wiring the session to the OAuth token.' },
    34500: { message: 'test the OAuth flow end to end', prompt: 'Write and run the OAuth flow tests (success, invalid state, user refusal).' },
    37500: { message: 'Writing tests/oauth.test.ts' },
    41500: { message: 'npm test -- oauth' },
    44500: { message: '1 failing test: invalid state not rejected' },
    44700: { message: 'The callback accepts an invalid state!' },
    46500: { message: "Back, /auth/callback doesn't check the state." },
    48600: { message: 'Good catch, fixing it right away.' },
    49000: { message: 'Strict comparison with the state stored in the session.' },
    50300: { message: 'Plan updated.' },
    50500: { message: 'GitHub button + callback handling OK.' },
    53500: { message: 'npm test -- oauth (second run)' },
    56500: { message: '12 tests passing' },
    57500: { message: 'OAuth routes in place, state checked, token encrypted.' },
    59500: { message: '12/12 tests green, including the invalid-state case.' },
    62500: { message: 'All done.' },
    63500: { message: 'Mission complete: GitHub OAuth shipped and tested. Thanks, team!' },
    65000: { message: 'Done — your turn!' }
  };
  for (const s of steps) {
    const en = EN[s.at];
    if (!en) continue;
    s.en = { ...en };
    if (s.todos) s.en.todos = s.todos.map(t => ({ ...t, content: TASKS_EN[t.content] || t.content }));
  }

  const api = { steps, durationMs: steps[steps.length - 1].at + 2000 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DEMO_SCENARIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
