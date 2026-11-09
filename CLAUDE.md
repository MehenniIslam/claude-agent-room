# claude-agent-room — consignes pour Claude Code

Visualiseur pixel art d'un agent Claude orchestrateur et de ses sous-agents. Deux produits dans ce dépôt :

1. **Le plugin Claude** (`plugin/agent-room/`) : mod Claude Code qui dessine la chambre en SVG animé dans un panneau à côté de la conversation. C'est la priorité.
2. **La version web** (`server/`, `bridge/`, `public/`, `tui/`, `bin/cli.js`) : serveur Express + WebSocket, hooks Claude Code, interface navigateur et terminal.

## Commandes

- Plugin : `claude plugin validate plugin/agent-room`, `claude plugin test plugin/agent-room` (tests dans `plugin/agent-room/tests/`), `claude plugin validate .` pour le marketplace
- Version web : `npm install`, `npm test` (node --test, 36 tests), `npm start` → http://localhost:3030, `npm run demo`
- Type-check du plugin : une fois le plugin chargé par Claude Code, les types sont posés dans `plugin/agent-room/.claude-plugin/types/` (ignoré par git) et `npx tsc -p plugin/agent-room` fonctionne

## Tester le plugin en vrai, sur ce Mac

1. Si le plugin est déjà installé depuis GitHub, retire-le d'abord (`claude plugin uninstall agent-room`, puis `claude plugin marketplace remove claude-agent-room`). Ensuite, à la racine du dépôt : `claude plugin install agent-room --marketplace "$PWD"`. Le plugin est alors lu directement depuis ce dossier, sans réinstallation à chaque modification.
2. Dans l'app Claude (onglet Code) ou dans `claude`, ouvre un projet de test. Après chaque modification du plugin, tape `/reload-plugins`.
3. Déclenche des sous-agents : « Crée deux sous-agents : l'un écrit `a.html`, l'autre écrit `a.css` puis modifie une couleur. » Regarde le panneau Agent Room (`/agent-room` s'il est fermé).
4. Dans le terminal, le panneau n'affiche que du texte (pas de `Svg` sur cette surface) : l'image ne se teste que dans l'app.

## Architecture du plugin

- `hooks/register.tsx` : hooks `session.start` (commande `/agent-room`, ouverture du panneau), `agent.spawn` (naissance d'un sous-agent), `turn.complete` (rapport, pause, retraite), `tool.call` (déplacement vers le poste de l'outil, fichiers modifiés et diff), `ui.render` sur le `Pane`.
- `hooks/scene.ts` : la chambre en SVG (320×208, 4 mondes), animations SMIL avec des `begin` négatifs calculés depuis l'heure de chaque événement, pour qu'un nouveau rendu reprenne là où l'animation en était.
- État dans `$.state` (atomes `room` et `prefs`, contrat dans `types/index.d.ts`), préférences dans `$.store`.
- Les gardes `tool.call` et `agent.spawn` ont un `.catch` qui appelle `next(e)` : une erreur du plugin ne doit jamais bloquer un outil.

## Problèmes connus à vérifier et corriger (ordre de priorité)

1. ✅ *Corrigé en 0.3.0 (image sans taille imposée, pleine largeur).* **Taille de la chambre dans le panneau de l'app** : en 0.1.0, elle apparaissait petite avec des bandes noires sur les côtés. En 0.2.0, `width` et `height` sont passés à `Svg`, calculés depuis `bodyColumns × 6,5` px : c'est une estimation à vérifier. Si l'image déborde ou reste petite, ajuster le calcul.
2. **Claude qui se déplace quand il travaille seul** (0.2.0, non vérifié en vrai) : il doit aller au poste de l'outil (Read → bibliothèque, Edit/Write → bureau de code, Bash → banc de test) puis revenir à son bureau après 6 s d'inactivité.
3. **Sous-agents en parallèle** : vérifier que chaque appel d'outil est attribué au bon personnage (via `e.agentId` et l'`agentId` renvoyé par `agent.spawn`), et que la retraite à la pompe s'enchaîne bien pour chacun.
4. ✅ *Corrigé en 0.3.0 (Write sur fichier existant, MultiEdit, replace_all).* **Liste des fichiers** : vérifier les comptes +/− et le diff pour Write (nouveau fichier et réécriture), Edit et MultiEdit ; le diff est replié à 10 lignes avec un bouton « Voir tout le diff ».
5. ✅ *Corrigé en 0.3.0 (noms coupés au milieu).* **Textes longs** : bulles et noms de fichiers ne doivent jamais déborder du panneau.
6. ✅ *Corrigé en 0.3.0 (`fitScene` retire bulles puis agents anciens).* **Taille du SVG** : il doit rester sous 131 072 caractères même avec beaucoup d'agents (voir `MAX_LOUNGE`).

## Règles

- Après chaque correction : `claude plugin test plugin/agent-room` et `claude plugin validate .` doivent passer ; ajoute un test pour chaque bug corrigé.
- Monte `version` dans `plugin/agent-room/.claude-plugin/plugin.json` à chaque changement publié, pour que `claude plugin update` le voie.
- Textes de l'interface en français.
- Ne jamais committer de secret ; `node_modules/` et `.claude-plugin/types/` restent hors de git.
