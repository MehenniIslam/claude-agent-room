/*
 * Scénario de démonstration partagé par le serveur (POST /api/demo)
 * et par le navigateur (mode démo hors-ligne quand le serveur est absent).
 * Chaque étape : { at: millisecondes depuis le début, ...événement }.
 */
(function (root) {
  const M = 'claude-main';
  const steps = [
    { at: 0, type: 'AGENT_MESSAGE', agentId: M, message: "Nouvelle mission : ajouter la connexion OAuth (GitHub) à l'app et la couvrir de tests." },
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
    { at: 22600, type: 'SUBAGENT_COMPLETE', agentId: 'sub-archi', message: 'Plan prêt : 5 étapes, state anti-CSRF, token chiffré en session.' },
    { at: 23800, type: 'TOOL_START', agentId: 'sub-front', tool: 'Edit', file: 'src/pages/Login.tsx', message: 'Ajout du bouton GitHub dans Login.tsx' },
    { at: 25000, type: 'TOOL_START', agentId: 'sub-back', tool: 'Write', file: 'src/server/oauth.ts', message: 'Création de src/server/oauth.ts' },
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
    { at: 49000, type: 'TOOL_START', agentId: 'sub-back', tool: 'Edit', file: 'src/server/oauth.ts', message: 'Comparaison stricte du state stocké en session.' },
    { at: 50500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-front', message: 'Bouton GitHub + gestion du retour OK.' },
    { at: 53500, type: 'TOOL_START', agentId: 'sub-test', tool: 'Bash', message: 'npm test -- oauth (2e passage)' },
    { at: 56500, type: 'TOOL_END', agentId: 'sub-test', tool: 'Bash', success: true, message: '12 tests passent' },
    { at: 57500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-back', message: 'Routes OAuth en place, state vérifié, token chiffré.' },
    { at: 59500, type: 'SUBAGENT_COMPLETE', agentId: 'sub-test', message: '12/12 tests verts, y compris le cas state invalide.' },
    { at: 63500, type: 'AGENT_MESSAGE', agentId: M, message: "Mission terminée : OAuth GitHub livré et testé. Merci l'équipe !" }
  ];

  const api = { steps, durationMs: steps[steps.length - 1].at + 2000 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DEMO_SCENARIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
