# Changelog

## 1.4.0 — plugin 0.3.0

### Une seule commande
- `setup` installe tout sans poser de question : hooks (avec sauvegarde de `settings.json`), plugin Agent Room dans Claude (s'il manque), puis le site s'ouvre. L'ancien assistant reste disponible avec `setup --guide`.
- Sans commande `claude` sur la machine, le site s'installe quand même et `setup` indique la commande à lancer plus tard.

### Plugin (panneau dans Claude)
- La chambre prend toute la largeur du panneau : elle est dessinée en image, sans taille imposée (avant, le cadre interactif retombait à ~150 px de haut avec des bandes noires).
- Bouton « ⤢ Chambre seule » (mémorisé) et lien « 🌐 Vue 3D sur le site » (port `AGENT_ROOM_PORT`).
- Réécrire un fichier existant avec Write compte et montre les lignes retirées ; MultiEdit enchaîne ses modifications ; `replace_all` compte chaque occurrence.
- Les noms de fichiers longs sont coupés au milieu ; le SVG reste sous 131 072 caractères même avec beaucoup d'agents au travail.

### Site
- Sous-agents en arrière-plan : la confirmation de lancement n'est plus prise pour leur rapport ; leur vrai rapport (SubagentHandback ou SubagentStop) clôt la mission.
- La fin d'un appel d'outil revient à celui qui l'a commencé ; en mode `watch`, les appels du transcript principal restent à Claude et un message réécrit n'est plus rejoué.
- Arrêter `watch` arrête aussi son lecteur de transcript (il restait tourner seul et envoyait des événements en double).

### Qualité
- 36 tests Node et 12 tests du plugin.

## 1.3.0

### Économiser des tokens
- **Conseiller tokens** : au premier démarrage de Claude Code dans un projet, Claude propose une fois une sélection d'outils vérifiés (règles CLAUDE.md, Caveman, Context7 ; Context Mode et Token Savior pour les gros dépôts), avec gain mesuré et risque de chacun.
- Sélection issue de bancs d'essai publics et d'avis, puis vérification à la main de chaque dépôt (licence, activité, hooks, serveurs MCP, commit relu). Écartés : RTK, claude-mem, alexgreensh/token-optimizer, claude-context.
- `advisor` : liste, `check` (le dépôt a-t-il changé depuis la vérification ?), `apply` (liste fermée, confirmation si un dépôt a changé, jamais de `curl | sh`), `on` / `off` / `reset`. Règles CLAUDE.md embarquées, insérées entre balises avec sauvegarde.

### Pour le vibecoder
- **Notifications** : son, titre d'onglet et notification système quand Claude a fini ou attend ta réponse (hooks `Stop` et `Notification`) ; cloche ou touche `N` ; le terminal sonne.
- **Plan de Claude** : onglet Tâches (TodoWrite, TaskCreate, TaskUpdate) avec barre de progression, et le tableau de la chambre affiche les cases du plan.
- **Diffs** : clic sur un fichier modifié = lignes ajoutées et retirées en couleur, `+/−` dans la liste.
- **Coût** : tokens et prix estimé (tarif public de l'API, cache compris) pour la session et par agent, lus dans les transcripts de Claude Code.
- **Installation guidée** : `claude-agent-room setup` (hooks, conseiller, règles, ambiance, puis la chambre s'ouvre).

### Pour l'entreprise
- **Mode pro** : ambiance sobre (pas de fusil à pompe ni de blagues), partagée par tous les écrans et mémorisée ; `?mode=pro` pour un écran précis.
- **Journal sur disque** : un fichier par jour dans `~/.claude/agent-room/history/` (50 Mo max/jour, 14 jours par défaut), relu au redémarrage ; export JSON ou CSV (protégé contre l'injection de formules).
- Réglages persistants dans `~/.claude/agent-room/config.json` (`AGENT_ROOM_MODE`, `AGENT_ROOM_HISTORY`, `AGENT_ROOM_RETENTION_DAYS`).
- Paquet prêt pour npm (`prepublishOnly` lance les tests).

### Qualité
- 28 tests (notifications, plan, diffs, coût sur transcript réel simulé, journal et export, ambiance, conseiller).

## 1.2.0

### Interface
- **Nouvelle chambre en 3D isométrique** : murs et meubles en volume, ombres et lumière, sol et murs calculés pixel par pixel (bords nets), meubles découpés en tranches pour que les personnages passent devant ou derrière.
- **Nouveaux personnages** plus grands, 4 directions, assis, en train de lire, de taper ou de boire un café ; accessoires par rôle. Claude a un look original : sweat orange à capuche et petite étincelle au-dessus de la tête.
- Les 4 mondes refaits en isométrique (`public/worlds.js` : palette + décor, bien plus simple à étendre).
- Étiquettes compactes (nom seul) qui se masquent au lieu de s'empiler quand la chambre est pleine ; bulles plus légères.
- Sur petit écran, la chambre remplit la place disponible au lieu de rester minuscule.

### Mode terminal
- Nouvelle commande `claude-agent-room tui` : la chambre en couleurs dans le terminal (plan, agents, fichiers, journal), serveur démarré automatiquement si besoin.

### Gros projets
- Hook : tous les champs volumineux sont tronqués (avant, un gros `Edit`/`MultiEdit` dépassait la limite du serveur et l'événement était perdu) ; stdin borné, récupération de l'événement si le JSON est illisible.
- Suivi de transcript : liste des fichiers relue toutes les 5 s (et non plus 2,5 fois par seconde), transcripts récents seulement, lecture par morceaux de 4 Mo, lignes géantes sautées, passages jamais superposés.
- Serveur : mémoire des sous-agents bornée, limite de débit relevée, client trop lent déconnecté.
- Page web : agents, fichiers et fiche bornés ; meubles pré-rendus ; aucune allocation par image.
- Plugin : salon limité à 6 agents en pause (le dessin ne dépasse plus la limite de taille du panneau).

## 1.1.0

### Sécurité
- **Corrigé** : n'importe quel site ouvert dans le navigateur pouvait se connecter à `ws://localhost:3030/ws` et lire l'historique (prompts, commandes, chemins). Le WebSocket et l'API vérifient désormais l'origine.
- **Corrigé** : DNS rebinding (en-tête `Host` désormais contrôlé) et CSRF sur `/api/reset`, `/api/demo`.
- Jeton facultatif (`AGENT_ROOM_TOKEN`), obligatoire et généré automatiquement quand le serveur écoute sur le réseau.
- Masquage des secrets (clés API, tokens, mots de passe, clés privées) dans le hook et le serveur.
- En-têtes de sécurité (CSP stricte, anti-iframe, `nosniff`…), erreurs en JSON sans pile d'appels.
- Événements filtrés champ par champ, limites de taille, de débit et de clients ; heartbeat WebSocket.
- Polices embarquées : plus aucune requête vers Google Fonts.

### Installation
- Nouveau CLI `claude-agent-room` : `start`, `--open`, `hooks install|remove|status`, `demo`, `watch`, `doctor`.
- Lancement sans cloner : `npx github:MehenniIslam/claude-agent-room`.
- Le script du hook est copié dans `~/.claude/agent-room/` : il continue de marcher si le dépôt est déplacé ou lancé via npx.
- Commande du hook avec barres obliques (fonctionne dans cmd, PowerShell et bash sous Windows).
- Écriture atomique de `settings.json`, détection d'une chambre déjà lancée, message clair si le port est pris.
- Express 5, Node 18.17+.

### Interface
- Carte d'accueil quand la chambre est vide (démo ou commande à copier pour brancher Claude Code).
- Onglet **Fichiers** : tout ce que les agents ont créé (✚), modifié (✎) ou lu (◌), cliquable.
- Filtres du journal (Outils, Messages, Erreurs), notifications, plein écran, fenêtre d'aide.
- Raccourcis clavier : `D` démo, `S` spawn, `R` reset, `W` monde suivant, `F` plein écran, `?` aide.
- Indicateur « Claude Code branché », état « Jeton requis », reconnexion signalée.
- Accessibilité : focus visible, lien d'évitement, `prefers-reduced-motion` respecté.

### Qualité
- Tests automatisés (`npm test`, runner intégré de Node) : sécurité du serveur, masquage, hooks, normalisation.
- CI GitHub Actions (Linux, Windows, macOS ; Node 18 à 24).

## 1.0.0
- Première version : chambre pixel art, 4 mondes, retraite à la pompe, plugin Claude Code.
