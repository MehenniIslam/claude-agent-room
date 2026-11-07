<div align="center">

# 🛋️ claude-agent-room

**Regarde Claude et ses sous-agents travailler, en direct, dans une chambre en pixel art.**

[![CI](https://github.com/MehenniIslam/claude-agent-room/actions/workflows/ci.yml/badge.svg)](https://github.com/MehenniIslam/claude-agent-room/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-d97757.svg)](LICENSE)
[![Node ≥ 18.17](https://img.shields.io/badge/node-%E2%89%A5%2018.17-5ef1ff.svg)](https://nodejs.org)
[![Local-first](https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-7ee787.svg)](SECURITY.md)

![La chambre en pleine démo](docs/screenshot.png)

[Installation](#-installation) · [Brancher Claude Code](#-brancher-claude-code) · [Utilisation](#-utilisation) · [Sécurité](#-sécurité-et-confidentialité) · [Dépannage](#-dépannage) · [API](#-protocole-dévénements)

</div>

---

Chaque sous-agent que Claude crée apparaît dans un rayon de lumière, **marche vers le poste qui correspond à l'outil qu'il utilise** (bibliothèque pour lire, bureaux pour coder, banc de test pour `Bash`…), parle dans des bulles, puis revient remettre son rapport à Claude. Ensuite ? Pause café… ou retraite à la pompe. 💥

## ✨ Ce que tu obtiens

- 🎮 **Une chambre vivante** : pathfinding A*, animations, bulles qui s'empilent, voyants verts/rouges quand les tests passent ou cassent.
- 🌍 **4 mondes** : Studio dev, Opéra, Jardin, Salle de classe, changeables en pleine mission.
- 🗂️ **Le suivi des fichiers** : tout ce que les agents créent ✚, modifient ✎ ou lisent ◌, avec l'auteur.
- 🧭 **Le contexte complet** : arbre des agents, journal filtrable, fiche détaillée (prompt initial, historique) au clic.
- 🔌 **Deux façons de l'utiliser** : en **plugin** dans un panneau de Claude Code (rien à lancer), ou en **page web** sur un deuxième écran.
- 🔒 **Local et sûr** : aucune donnée ne quitte ta machine, les clés API et mots de passe sont masqués, les autres sites ne peuvent pas espionner la chambre.

## 🚀 Installation

Trois options, de la plus simple à la plus complète.

### Option 1 — Le plugin Claude Code (rien à lancer)

La chambre s'ouvre dans un panneau à côté de la conversation. Pas de serveur, pas de hooks à configurer.

<img src="docs/plugin-studio.png" width="420" alt="La chambre dans le panneau de Claude"> <img src="docs/plugin-pompe.png" width="420" alt="Retraite à la pompe dans l'Opéra">

Dans une session Claude Code (terminal), tape :

```
/plugin install agent-room --marketplace MehenniIslam/claude-agent-room
```

Réponds `y` pour ajouter le marketplace, puis choisis la portée « user » avec Entrée. Depuis un shell, c'est la même chose :

```bash
claude plugin install agent-room --marketplace MehenniIslam/claude-agent-room
```

Dans l'**app de bureau** (où `/plugin` ne s'exécute pas) : **+** à côté de la zone de saisie → **Plugins** → **Add marketplace** avec `MehenniIslam/claude-agent-room` → **Add plugin**.

Le panneau s'ouvre tout seul à chaque session (sinon tape `/agent-room`). Il montre la chambre, **« Ce que Claude modifie »** (chaque fichier avec ses lignes `+/−` et un diff coloré au clic), le journal, et les menus **Monde** et **Fin**. Dans un terminal sans images, le panneau affiche la même chose en texte.

### Option 2 — La page web en une commande

Prérequis : [Node.js](https://nodejs.org) 18.17 ou plus récent (`node -v` pour vérifier).

```bash
npx github:MehenniIslam/claude-agent-room --open
```

La chambre s'ouvre sur **http://localhost:3030**. Clique sur **▶ Lancer la démo** pour voir une mission complète (5 sous-agents, un test qui casse, une correction) — aucun token consommé. Pour voir tes vrais agents, passe à [Brancher Claude Code](#-brancher-claude-code).

### Option 3 — Depuis le code source

```bash
git clone https://github.com/MehenniIslam/claude-agent-room.git
cd claude-agent-room
npm install
npm start            # ou : npm run open  (ouvre le navigateur)
```

> 💡 Pas de serveur du tout ? Ouvre directement `public/index.html` : la page passe en **Mode démo** et joue la simulation localement.

## 🔌 Brancher Claude Code

La page web reçoit les événements de Claude Code grâce à des [hooks](https://docs.claude.com/en/docs/claude-code/hooks). Une commande les installe :

```bash
npx github:MehenniIslam/claude-agent-room hooks install
```

(ou `npm run hooks:install` depuis le dossier cloné). Ensuite :

1. Laisse la chambre tourner (option 2 ou 3 ci-dessus).
2. Relance Claude Code, et tape `/hooks` pour vérifier que les hooks sont là.
3. Donne-lui une tâche avec des sous-agents, par exemple :
   *« Utilise un sous-agent pour explorer le code d'authentification, puis un autre pour écrire les tests. »*

Le badge en haut de la page passe à **En direct · Claude Code branché** dès le premier événement.

**Vérifier que tout marche** — une seule commande contrôle Node, les dépendances, le serveur, les hooks, et envoie une bulle de test :

```bash
npx github:MehenniIslam/claude-agent-room doctor
```

<details>
<summary><b>Ce que fait l'installation, exactement</b></summary>

- copie le script du hook dans `~/.claude/agent-room/claude-hook.js` : il continue de marcher même si tu déplaces ou supprimes le dépôt ;
- ajoute 6 hooks (`PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`) dans `~/.claude/settings.json` ;
- **sauvegarde** d'abord ton `settings.json` (`settings.json.bak-<date>`), écrit de façon atomique et **conserve tes autres hooks** ;
- peut être relancée sans créer de doublons.

Variantes :

| Commande | Effet |
|---|---|
| `… hooks install --project` | Installe pour le projet courant seulement (`./.claude/settings.json`) |
| `… hooks install --dry-run` | Affiche le résultat sans rien écrire |
| `… hooks status` | Indique si les hooks sont installés |
| `… hooks remove` | Retire proprement les hooks (ajoute `--project` si besoin) |

Le hook ne bloque **jamais** Claude : délai max 700 ms, aucune sortie, code de sortie 0 même si la chambre est fermée. Pour le couper temporairement : `AGENT_ROOM_DISABLED=1`.

Si ta version de Claude Code ne connaît pas `SubagentStart`, ce n'est pas grave : la chambre fonctionne sans.
</details>

<details>
<summary><b>Alternative sans hooks : suivre un transcript</b></summary>

```bash
npx github:MehenniIslam/claude-agent-room watch                       # le transcript le plus récent de ~/.claude/projects
npx github:MehenniIslam/claude-agent-room watch ~/.claude/projects/   # tout un dossier (sous-agents inclus)
```

Seules les nouvelles lignes sont rejouées.
</details>

## 🎮 Utilisation

### L'interface

| Zone | Ce qu'elle montre |
|---|---|
| **Chambre** | Claude au centre, les sous-agents à leur poste. Clique sur un personnage pour ouvrir sa fiche. |
| **Hiérarchie** | L'arbre des agents et ce que chacun fait en ce moment. |
| **Journal** | Chaque action horodatée, filtrable : *Outils*, *Messages*, *Erreurs*. |
| **Fichiers** | Les fichiers créés ✚, modifiés ✎ ou lus ◌, et par qui. |

### Raccourcis clavier

| Touche | Action | | Touche | Action |
|:-:|---|---|:-:|---|
| <kbd>D</kbd> | Lancer la démo | | <kbd>W</kbd> | Monde suivant |
| <kbd>S</kbd> | Faire apparaître un agent de test | | <kbd>F</kbd> | Plein écran |
| <kbd>R</kbd> | Vider la chambre | | <kbd>?</kbd> | Aide |

### 4 mondes au choix

![Studio, Opéra, Jardin, Salle de classe](docs/worlds.png)

| Monde | Claude est… | Planifier | Lire / chercher | Coder | Tester (Bash) | Pause |
|---|---|---|---|---|---|---|
| 💻 Studio dev | Orchestrateur | tableau blanc | bibliothèque + serveurs | 4 bureaux dev | banc de test | canapé + café |
| 🎭 Opéra | Chef d'orchestre | grande partition | partitions + orgue | pupitres des musiciens | régie son & lumière | loge VIP |
| 🌻 Jardin | Jardinier en chef | plan du potager | serre + ruches | carrés potagers | établi d'arrosage | barbecue |
| 🏫 Salle de classe | Professeur | tableau noir | bibliothèque + aquarium | pupitres d'élèves | paillasse de sciences | coin récré |

Le choix est mémorisé. Lien direct : `http://localhost:3030/?world=opera` (`studio`, `opera`, `garden`, `classroom`).

### Fin des agents : à la pompe 💥 ou pause café ☕

Un sous-agent qui a rendu son rapport ne sera plus jamais rappelé. Par défaut, la chambre le montre sans détour : après sa pause au canapé, **Claude sort un fusil à pompe**. Clic-clac, BANG, l'agent part en petit fantôme avec une dernière réplique. Pur cartoon : des étoiles et un halo, rien de plus.

![Retraite à la pompe](docs/retraite.png)

S'il est rappelé avant le tir, il est épargné. Préfère la version douce ? Menu **Fin des agents → ☕ Pause café** (ou `?fin=cafe`).

## 🔒 Sécurité et confidentialité

La chambre voit passer tes prompts, tes commandes et tes chemins de fichiers. Elle est conçue pour que ça reste chez toi :

- **100 % local** : le serveur écoute uniquement `127.0.0.1`, ne contacte aucun service externe (polices embarquées, pas de CDN, pas de télémétrie).
- **Les autres sites sont bloqués** : une page web ouverte dans ton navigateur ne peut ni lire la chambre (WebSocket), ni y écrire (CSRF), ni la détourner par DNS rebinding.
- **Secrets masqués** : clés API (Anthropic, OpenAI, AWS, Google, Stripe…), tokens GitHub/GitLab/Slack/npm, JWT, clés privées, mots de passe dans une URL ou en `password=…` deviennent `[MASQUÉ]` avant même de quitter le hook.
- **Réseau = jeton obligatoire** : si tu exposes la chambre (`--host 0.0.0.0`), un jeton est exigé et généré automatiquement.
- **CSP stricte**, anti-iframe, entrées filtrées et limitées en taille et en débit.

Détails, modèle de menace et signalement de faille : [SECURITY.md](SECURITY.md).

## ⚙️ Configuration

| Option CLI | Variable | Défaut | Rôle |
|---|---|---|---|
| `--port <n>` | `PORT` ou `AGENT_ROOM_PORT` | `3030` | Port du serveur (le hook lit `AGENT_ROOM_PORT`) |
| `--host <ip>` | `HOST` | `127.0.0.1` | Interface d'écoute. `0.0.0.0` = réseau local, jeton exigé |
| `--open` | | | Ouvre le navigateur au démarrage |
| | `AGENT_ROOM_TOKEN` | *(aucun en local)* | Jeton exigé par l'API et le WebSocket ; à définir aussi côté hook |
| | `AGENT_ROOM_ALLOWED_HOSTS` | | Noms d'hôte supplémentaires acceptés, séparés par des virgules |
| | `AGENT_ROOM_URL` | `http://127.0.0.1:3030/api/event` | Cible du hook |
| | `AGENT_ROOM_TIMEOUT` | `700` | Délai max du hook (ms) |
| | `AGENT_ROOM_DISABLED` | | `1` coupe le hook sans le désinstaller |

Toutes les commandes : `npx github:MehenniIslam/claude-agent-room --help`.

## 🩺 Dépannage

<details>
<summary><b>La chambre reste vide quand j'utilise Claude Code</b></summary>

1. Lance `npx github:MehenniIslam/claude-agent-room doctor` : il indique ce qui manque.
2. Vérifie que la chambre tourne **avant** de donner la tâche à Claude.
3. Relance Claude Code après l'installation des hooks (ils sont lus au démarrage), puis `/hooks` pour les voir.
4. Si tu as changé de port, définis `AGENT_ROOM_PORT` dans l'environnement de Claude Code aussi.
</details>

<details>
<summary><b>« Le port 3030 est déjà utilisé »</b></summary>

Si c'est déjà la chambre, le CLI le détecte et te donne simplement l'URL. Sinon, choisis un autre port : `--port 3031`, et `AGENT_ROOM_PORT=3031` pour le hook.
</details>

<details>
<summary><b>Le badge affiche « Jeton requis »</b></summary>

Le serveur a été lancé avec un jeton (ou sur le réseau). Ouvre l'URL complète affichée dans le terminal, celle qui se termine par `?token=…`.
</details>

<details>
<summary><b>« node » n'est pas reconnu / version trop ancienne</b></summary>

Installe Node.js LTS depuis [nodejs.org](https://nodejs.org) (sous Windows : `winget install OpenJS.NodeJS.LTS`), puis ouvre un **nouveau** terminal.
</details>

<details>
<summary><b>Plusieurs sous-agents en parallèle : un outil est attribué au mauvais agent</b></summary>

Claude Code n'indique pas toujours quel sous-agent appelle un outil. Le serveur utilise `agent_id` quand il est présent, sinon le dernier sous-agent actif, sinon Claude. Avec des sous-agents en parallèle, l'attribution peut être approximative. Le plugin (option 1) n'a pas cette limite.
</details>

<details>
<summary><b>Désinstaller complètement</b></summary>

```bash
npx github:MehenniIslam/claude-agent-room hooks remove
```

Puis supprime le dossier `~/.claude/agent-room/`. Pour le plugin : `/plugin uninstall agent-room`.
</details>

## 📡 Protocole d'événements

Tu peux piloter la chambre depuis n'importe quel script (Anthropic SDK, serveur MCP, CI…) :

```bash
curl -X POST localhost:3030/api/event -H 'content-type: application/json' -d '{
  "type":"SUBAGENT_SPAWN","agentId":"sub-1","role":"Researcher","name":"Scout",
  "message":"cartographier les routes API"}'
curl -X POST localhost:3030/api/event -H 'content-type: application/json' -d '{
  "type":"TOOL_START","agentId":"sub-1","tool":"Grep","message":"grep \"router\" src/"}'
curl -X POST localhost:3030/api/event -H 'content-type: application/json' -d '{
  "type":"SUBAGENT_COMPLETE","agentId":"sub-1","message":"12 routes trouvées."}'
```

<details>
<summary><b>Format complet et routes</b></summary>

`POST /api/event` accepte un objet ou un tableau (200 max), ou directement un payload brut de hook Claude Code :

```json
{
  "type": "SUBAGENT_SPAWN | TOOL_START | TOOL_END | AGENT_MESSAGE | SUBAGENT_COMPLETE | ERROR | RESET",
  "agentId": "subagent-1",
  "parentId": "claude-main",
  "role": "Coder | Researcher | Architect | Tester | Reviewer | Debugger",
  "name": "Agent-Front",
  "tool": "Read | Edit | Bash | Grep | Task",
  "message": "Je vérifie le composant d'authentification dans src/auth.ts...",
  "targetAgentId": "claude-main",
  "prompt": "Prompt complet affiché dans la fiche (SUBAGENT_SPAWN)",
  "file": "src/auth.ts",
  "success": true
}
```

Seuls ces champs sont conservés (les autres sont ignorés) ; les textes sont tronqués et leurs secrets masqués. L'orchestrateur a l'identifiant `claude-main`.

| Route | Rôle |
|---|---|
| `POST /api/event` | Envoie un ou plusieurs événements |
| `POST /api/demo?speed=2` | Lance la démo (vitesse 0.25 à 4) |
| `POST /api/reset` | Vide la chambre |
| `GET /api/state` | Historique récent (400 événements) et statistiques |
| `GET /api/health` | Vérification simple, sans données |
| `WS /ws` | Flux temps réel ; l'historique est rejoué à la connexion. On peut aussi y envoyer des événements |

Avec un jeton : en-tête `x-agent-room-token: <jeton>` (ou `Authorization: Bearer <jeton>`), et `?token=<jeton>` pour le WebSocket. Les requêtes venant d'un navigateur doivent provenir de la page de la chambre.

Dans la console du navigateur, `roomDebug.emit({...})` injecte un événement localement.
</details>

<details>
<summary><b>Comment le pont traduit Claude Code</b></summary>

| Payload Claude Code | Événement chambre |
|---|---|
| `PreToolUse` sur `Task` / `Agent` | `SUBAGENT_SPAWN` (nom tiré de `subagent_type` ou `description`, rôle déduit) |
| `PreToolUse` autre outil | `TOOL_START` (fichier, commande ou requête résumés) |
| `PostToolUse` | `TOOL_END` (+ `ERROR` si échec) |
| `PostToolUse` sur `Task` / `Agent`, ou `SubagentStop` | `SUBAGENT_COMPLETE` avec le début du rapport |
| `UserPromptSubmit` | Claude annonce la nouvelle demande |
</details>

## 🧱 Architecture

```mermaid
flowchart LR
  CC["Claude Code"] -- "hooks (stdin JSON)" --> H["claude-hook.js<br/>masque les secrets"]
  H -- "POST /api/event" --> S["Serveur local<br/>Express + ws<br/>127.0.0.1:3030"]
  S -- "WebSocket /ws" --> B["Navigateur<br/>chambre pixel art"]
  X["Tes scripts"] -. "POST / WS" .-> S
  CC -. "plugin (sans serveur)" .-> P["Panneau Agent Room"]
```

```
claude-agent-room/
├── bin/cli.js               # point d'entrée : start, hooks, demo, watch, doctor
├── server/
│   ├── index.js             # Express + ws : API, démo, diffusion temps réel
│   ├── security.js          # hôte, origine, jeton, débit, en-têtes
│   └── normalize.js         # payloads Hooks Claude Code → événements chambre
├── bridge/
│   ├── claude-hook.js       # hook stdin → POST (+ masquage, + mode --jsonl)
│   └── setup-hooks.js       # installe / retire les hooks
├── public/                  # page web : moteur pixel art, 4 mondes, HUD, polices
├── plugin/agent-room/       # plugin Claude Code : panneau SVG, suivi des fichiers
├── .claude-plugin/          # marketplace (rend le dépôt installable avec /plugin)
└── test/                    # tests : npm test
```

## 🎨 Ajouter ton propre monde

Tous les mondes partagent la même disposition (postes, obstacles, chemins) ; un monde ne fait que redessiner le décor. Ajoute une fonction dans `public/worlds.js` et enregistre-la dans `ROOM_WORLDS` :

```js
function spaceship(api) {
  const { px, g } = api;            // px(contexte, x, y, largeur, hauteur, couleur)
  return {
    id: 'spaceship', name: 'Vaisseau spatial', icon: '🚀', claudeTitle: 'Commandant',
    glyphs: ['✦', '01', '◉'],       // particules au poste "code"
    status: { coding: 'Pilote', reading: 'Scanne', planning: 'Trace la route', bash: 'Teste les moteurs', coffee: 'En cabine' },
    background(c, rand) { /* sol, murs, meubles fixes (dessinés une seule fois) */ },
    top(t) { /* animations du mur : étoiles, écrans… */ },
    board(t, strokes) { api.drawStrokes(strokes, t); },
    props(t) { return [ /* { y: ligne de base, draw: () => … } triés avec les personnages */ ]; },
    lighting(t) { api.vignette(0.4); }
  };
}
root.ROOM_WORLDS = { opera, garden, classroom, spaceship };
```

Les emplacements à respecter sont listés en tête de `worlds.js`. L'objet `api` donne aussi l'état de la chambre : `codeUser(i)`, `readers()`, `benchRunning()`, `mainActive()`, `deskPile()`, etc.

## 🤝 Contribuer

```bash
npm install
npm run dev      # serveur relancé à chaque modification
npm test         # tests du serveur, du masquage et des hooks
```

Les contributions sont bienvenues : un nouveau monde, un rôle d'agent, une traduction… Ouvre une issue pour en discuter, ou directement une pull request. Les failles de sécurité se signalent en privé (voir [SECURITY.md](SECURITY.md)). Historique des versions : [CHANGELOG.md](CHANGELOG.md).

## 📄 Licence

[MIT](LICENSE). Polices embarquées : [Pixelify Sans](public/fonts/OFL-PixelifySans.txt) et [JetBrains Mono](public/fonts/OFL-JetBrainsMono.txt), sous licence SIL Open Font License 1.1.
