<div align="center">

<img src="docs/banner-fr.svg" width="100%" alt="claude-agent-room — regarde Claude et ses sous-agents travailler, en direct, dans une chambre en pixel art">

<br>

[![CI](https://github.com/MehenniIslam/claude-agent-room/actions/workflows/ci.yml/badge.svg)](https://github.com/MehenniIslam/claude-agent-room/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-d97757?style=flat-square)](LICENSE)
[![Node ≥ 18.17](https://img.shields.io/badge/node-%E2%89%A5%2018.17-5ef1ff?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![100 % local](https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-7ee787?style=flat-square)](SECURITY.md)
[![Plugin Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-bd93f9?style=flat-square)](#-installation)

[English](README.md) · **Français**

[Démarrage](#-démarrage-rapide) · [Fonctionnalités](#-fonctionnalités) · [Installation](#-installation) · [Brancher Claude Code](#-brancher-claude-code) · [Tokens](#-économiser-des-tokens) · [Sécurité](#-sécurité-et-confidentialité) · [API](#-api-dévénements)

</div>

---

> Chaque sous-agent que Claude crée apparaît dans un rayon de lumière, **marche vers le poste qui correspond à l'outil qu'il utilise** (bibliothèque pour lire, bureaux pour coder, banc de test pour `Bash`), parle dans des bulles, puis revient remettre son rapport à Claude. Ensuite ? Pause café… ou retraite à la pompe. 💥

<div align="center">
<img src="docs/iso-studio.jpg" width="780" alt="La chambre isométrique en pleine démo : Claude au centre, les sous-agents à leur poste">
</div>

## ⚡ Démarrage rapide

Il te faut [Node.js](https://nodejs.org) 18.17 ou plus récent (`node -v`). Puis une seule commande :

```bash
npx github:MehenniIslam/claude-agent-room setup
```

L'assistant pose quatre questions (brancher Claude Code ? proposer les outils d'économie de tokens ? ajouter les règles d'économie à ce projet ? ambiance fun ou pro ?) et ouvre la chambre sur **http://localhost:3030**. Clique sur **▶ démo** pour voir une mission complète — 5 sous-agents, un test qui casse, une correction — sans consommer un seul token.

Tout se défait : `hooks remove`, `advisor off`, et l'ambiance se change dans la page.

> [!TIP]
> L'interface parle **français et anglais** : elle suit la langue du navigateur, et le menu **Langue** (ou `?lang=fr` / `?lang=en`) la change. Le mode terminal, la CLI et le conseiller tokens suivent la langue du système (`--lang fr|en` ou `AGENT_ROOM_LANG`).

## ✨ Fonctionnalités

<table>
<tr>
<td width="33%" valign="top">

### 🧊 Chambre isométrique
Murs et meubles en volume, lumière, ombres. Des personnages en pixel art marchent (pathfinding A*), s'assoient, lisent, tapent du code. Claude porte un sweat orange et une petite étincelle sur la tête.

</td>
<td width="33%" valign="top">

### 🔔 Prévenu au bon moment
Un son et une notification quand Claude **a fini** ou **attend ta réponse**. Fais autre chose pendant qu'il travaille.

</td>
<td width="33%" valign="top">

### 📋 Le plan de Claude
Sa vraie liste de tâches, cochée en direct, avec une barre de progression — et dessinée sur le tableau de la chambre.

</td>
</tr>
<tr>
<td valign="top">

### 🔍 Les diffs
Clique sur un fichier modifié pour voir exactement les lignes ajoutées et retirées, et par quel agent.

</td>
<td valign="top">

### 💰 Coût et tokens
Tokens et prix estimé, pour toute la session et pour chaque agent, cache compris.

</td>
<td valign="top">

### 💡 Moins de tokens
Au début d'un projet, Claude propose des outils vérifiés qui réduisent la consommation — jusqu'à **−40 % mesurés**.

</td>
</tr>
<tr>
<td valign="top">

### 💼 Mode pro
Une ambiance sobre pour le bureau ou une démo client, un journal sur disque et un export JSON/CSV pour l'audit.

</td>
<td valign="top">

### 💻 Trois façons de regarder
Un panneau **plugin** dans Claude Code, une **page web** sur un deuxième écran, ou **directement dans le terminal**.

</td>
<td valign="top">

### 🔒 Local et sûr
Rien ne quitte ta machine. Clés API et mots de passe masqués ; les autres sites ne peuvent pas espionner la chambre.

</td>
</tr>
</table>

Et aussi : 4 mondes, l'arbre des agents en direct, un journal filtrable, une fiche par agent, et des garde-fous qui bornent la mémoire sur les gros projets et les longues sessions.

## 📦 Installation

| | Idéal pour | Comment |
|---|---|---|
| 🧩 **Plugin** | Regarder dans Claude Code, rien à lancer | `/plugin install agent-room --marketplace MehenniIslam/claude-agent-room` |
| 🌐 **Page web** | Une grande vue sur un deuxième écran, le tableau de bord complet | `npx github:MehenniIslam/claude-agent-room --open` |
| 🛠️ **Code source** | Bidouiller | `git clone` → `npm install` → `npm start` |

<details>
<summary><b>🧩 Le plugin en détail</b></summary>

<br>

La chambre s'ouvre dans un panneau à côté de la conversation. Pas de serveur, pas de hooks à configurer.

<img src="docs/plugin-studio.png" width="420" alt="La chambre dans le panneau de Claude"> <img src="docs/plugin-pompe.png" width="420" alt="Retraite à la pompe dans l'Opéra">

Dans une session Claude Code, tape :

```
/plugin install agent-room --marketplace MehenniIslam/claude-agent-room
```

Réponds `y` pour ajouter le marketplace, puis choisis la portée « user ». Depuis un shell : `claude plugin install agent-room --marketplace MehenniIslam/claude-agent-room`.

Dans l'**app de bureau** (où `/plugin` ne s'exécute pas) : **+** à côté de la zone de saisie → **Plugins** → **Add marketplace** avec `MehenniIslam/claude-agent-room` → **Add plugin**.

Le panneau s'ouvre à chaque session (sinon tape `/agent-room`). Il montre la chambre, **ce que Claude modifie** (chaque fichier avec ses lignes `+/−` et un diff coloré au clic), le journal, et les menus **Monde** et **Fin**. Dans un terminal sans images, le panneau affiche la même chose en texte.

</details>

<details>
<summary><b>🛠️ Depuis le code source</b></summary>

<br>

```bash
git clone https://github.com/MehenniIslam/claude-agent-room.git
cd claude-agent-room
npm install
npm start            # ou : npm run open  (ouvre le navigateur)
```

Pas de serveur du tout ? Ouvre directement `public/index.html` : la page passe en **mode démo** et joue la simulation localement.

</details>

## 🔌 Brancher Claude Code

La page web reçoit les événements de Claude Code grâce à des [hooks](https://docs.claude.com/en/docs/claude-code/hooks). Une commande les installe (l'assistant `setup` le fait pour toi) :

```bash
npx github:MehenniIslam/claude-agent-room hooks install
```

1. Laisse la chambre tourner.
2. Relance Claude Code, tape `/hooks` pour vérifier qu'ils sont là.
3. Donne-lui une tâche avec des sous-agents, par exemple *« Utilise un sous-agent pour explorer le code d'authentification, puis un autre pour écrire les tests. »*

Le badge en haut passe à **En direct · Claude Code branché** dès le premier événement. Un souci ? Une commande vérifie Node, les dépendances, le serveur et les hooks, et envoie une bulle de test :

```bash
npx github:MehenniIslam/claude-agent-room doctor
```

<details>
<summary><b>Ce que fait l'installation, exactement</b></summary>

<br>

- copie le script du hook dans `~/.claude/agent-room/claude-hook.js` : il continue de marcher si tu déplaces ou supprimes le dépôt ;
- ajoute 8 hooks dans `~/.claude/settings.json` : `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`, `SessionStart` (conseiller tokens) et `Notification` (« Claude attend ») ;
- **sauvegarde** d'abord ton `settings.json` (`settings.json.bak-<date>`), écrit de façon atomique et **conserve tes autres hooks** ;
- peut être relancée sans créer de doublons.

| Commande | Effet |
|---|---|
| `… hooks install --project` | Pour le projet courant seulement (`./.claude/settings.json`) |
| `… hooks install --dry-run` | Affiche le résultat sans rien écrire |
| `… hooks status` | Indique si les hooks sont installés |
| `… hooks remove` | Les retire proprement (ajoute `--project` si besoin) |

Le hook ne bloque **jamais** Claude : 700 ms max, aucune sortie, code de sortie 0 même si la chambre est fermée. Pour le couper temporairement : `AGENT_ROOM_DISABLED=1`.

</details>

<details>
<summary><b>Sans hooks : suivre un transcript</b></summary>

<br>

```bash
npx github:MehenniIslam/claude-agent-room watch                       # le transcript le plus récent de ~/.claude/projects
npx github:MehenniIslam/claude-agent-room watch ~/.claude/projects/   # tout un dossier (sous-agents inclus)
```

Seules les nouvelles lignes sont rejouées.

</details>

## 🎮 Utiliser la chambre

| Zone | Ce qu'elle montre |
|---|---|
| **Chambre** | Claude au centre, les sous-agents à leur poste. Clique sur un personnage pour ouvrir sa fiche. Le tableau affiche le plan de Claude. |
| **Hiérarchie** | L'arbre des agents, ce que chacun fait et ce qu'il a coûté. |
| **Journal** | Chaque action horodatée, filtrable (*outils*, *messages*, *erreurs*), avec un bouton **exporter**. |
| **Tâches** | Le plan de Claude : tâches cochées en direct, barre de progression, tâche en cours. |
| **Fichiers** | Les fichiers créés ✚, modifiés ✎ ou lus ◌, avec `+lignes −lignes`. Clic = diff coloré. |
| **Coût estimé** | En haut : tokens et prix de la session (survol pour le détail entrée / sortie / cache). |

<details>
<summary><b>🔔 Notifications</b></summary>

<br>

Quand Claude a fini son tour ou attend ta réponse (une permission, une question), la chambre joue un petit son et affiche une notification. Si l'onglet est en arrière-plan, son titre indique `(1) Claude a fini` et une notification système apparaît (le navigateur demande l'autorisation la première fois). La cloche, ou <kbd>N</kbd>, coupe ou réactive. Le mode terminal fait sonner le terminal.

</details>

<details>
<summary><b>💰 Coût et tokens</b></summary>

<br>

La chambre lit les compteurs de tokens que Claude Code écrit dans ses transcripts (`~/.claude/projects`) et calcule un prix au **tarif public de l'API Anthropic** (cache compris), pour la session et pour chaque sous-agent. C'est une **estimation** : avec un abonnement Claude Pro ou Max, tu ne paies pas au token. Seuls les compteurs sont lus, jamais le contenu des conversations.

</details>

<details>
<summary><b>💼 Ambiance fun ou pro</b></summary>

<br>

Menu **Ambiance** : en **pro**, pas de fusil à pompe (les agents terminés restent en pause café) ni de blagues au salon. Le choix est partagé par tous les écrans branchés sur le même serveur et mémorisé dans `~/.claude/agent-room/config.json`. Pour un écran précis : `http://localhost:3030/?mode=pro`.

</details>

<details>
<summary><b>🗂️ Historique et export</b></summary>

<br>

Tous les événements sont gardés sur ta machine, un fichier par jour dans `~/.claude/agent-room/history/` (secrets déjà masqués, 50 Mo max par jour, 14 jours par défaut). Au redémarrage, la chambre retrouve les événements du jour. Bouton **exporter** dans le journal, ou `GET /api/export?day=AAAA-MM-JJ&format=csv`. Pour couper : `AGENT_ROOM_HISTORY=0`.

</details>

### ⌨️ Raccourcis clavier

| Touche | Action | | Touche | Action |
|:-:|---|---|:-:|---|
| <kbd>D</kbd> | Lancer la démo | | <kbd>W</kbd> | Monde suivant |
| <kbd>S</kbd> | Faire apparaître un agent de test | | <kbd>F</kbd> | Plein écran |
| <kbd>R</kbd> | Vider la chambre | | <kbd>N</kbd> | Notifications oui / non |
| <kbd>?</kbd> | Aide | | <kbd>Échap</kbd> | Fermer la fiche |

### 🌍 Quatre mondes

<table>
<tr>
<td align="center"><img src="docs/iso-studio.jpg" width="250" alt="Monde Studio"><br><b>💻 Studio dev</b><br><sub>Claude est l'Orchestrateur</sub></td>
<td align="center"><img src="docs/iso-opera.jpg" width="250" alt="Monde Opéra"><br><b>🎭 Opéra</b><br><sub>Claude est le Chef d'orchestre</sub></td>
</tr>
<tr>
<td align="center"><img src="docs/iso-garden.jpg" width="250" alt="Monde Jardin"><br><b>🌻 Jardin</b><br><sub>Claude est le Jardinier en chef</sub></td>
<td align="center"><img src="docs/iso-classroom.jpg" width="250" alt="Monde Salle de classe"><br><b>🏫 Salle de classe</b><br><sub>Claude est le Professeur</sub></td>
</tr>
</table>

Change en direct avec le menu **Monde** ou <kbd>W</kbd>. Lien direct : `http://localhost:3030/?world=opera` (`studio`, `opera`, `garden`, `classroom`).

### 💥 Fin des agents : à la pompe ou pause café

Un sous-agent qui a rendu son rapport ne sera plus jamais rappelé. Par défaut, la chambre le montre sans détour : après sa pause au salon, **Claude sort un fusil à pompe**. Clic-clac, BANG, l'agent part en petit fantôme avec une dernière réplique. Pur cartoon : des étoiles et un halo, rien de plus. S'il est rappelé avant le tir, il est épargné. Préfère la version douce ? **Fin des agents → ☕ Pause café** (ou `?fin=cafe`), ou le mode pro.

## 💻 Dans le terminal

Pas de navigateur ? La chambre s'affiche aussi directement dans le terminal, en couleurs :

```bash
npx github:MehenniIslam/claude-agent-room tui
```

Le serveur démarre tout seul s'il le faut. Tu vois le plan de la chambre (Claude = ✦, chaque sous-agent = son initiale, en minuscule quand il a fini), la liste des agents, l'avancement du plan, les fichiers modifiés, le journal et le coût — et le terminal sonne quand Claude a fini ou attend.

```
 ✚ Claude Agent Room  ● En direct · Claude Code branché · ~$0.42   q quitter · d démo · r vider · w monde
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  Agents 3 au travail · 2 en pause
▀▀▀▀▀▀A▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀B▀▀▀▀▀▀▀▀▀  ✦ Claude orchestre
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀✦▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  F Front Coder code · Edit
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀F▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  Plan ██████████░░░░░░░░ 3/5
▀▀▀▀Q▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀a▀▀b▀▀  ✎ src/pages/Login.tsx Front
```

Touches : <kbd>q</kbd> quitter · <kbd>d</kbd> démo · <kbd>r</kbd> vider · <kbd>w</kbd> monde suivant. Sur un terminal ancien sans couleurs 24 bits, ajoute `--256`. Comme la CLI, il suit la langue du système ; force-la avec `--lang fr` ou `AGENT_ROOM_LANG=fr`.

## 💡 Économiser des tokens

Tu lances Claude Code et tu lui dis *« crée-moi un site »* ? Avant d'écrire la première ligne, **Claude te propose une fois** d'activer des outils qui réduisent la consommation de tokens. Tu choisis ; rien ne s'installe sans ton accord.

La sélection vient d'une comparaison de ce qui existe (bancs d'essai publics, avis, dépôts GitHub), puis d'une relecture à la main de chaque dépôt : licence, activité, ce que lancent ses hooks et ses serveurs MCP, commit épinglé.

| Outil | Idéal pour | Gain mesuré | À savoir |
|---|---|:-:|---|
| **Règles d'économie** (CLAUDE.md) | tous les projets | **−40 %** | Aucun code exécuté : texte embarqué, ajouté entre balises dans ton CLAUDE.md |
| **[Caveman](https://github.com/JuliusBrussee/caveman)** | sessions bavardes | **−37 %** | Réponses très laconiques ; petit hook local au démarrage |
| **[Context7](https://github.com/upstash/context7)** | sites et apps (React, Next…) | moins de corrections | Serveur distant : reçoit les noms de bibliothèques, pas ton code |
| **[Context Mode](https://github.com/mksglu/context-mode)** | beaucoup de logs / tests | 50–90 % annoncés | Exécute du code en bac à sable ; licence Elastic 2.0 |
| **[Token Savior](https://github.com/Mibayy/token-savior)** | gros dépôts typés | **−43 %** | Installation manuelle (Python), version épinglée |

Gains mesurés sur le [banc d'essai de computingforgeeks](https://computingforgeeks.com/reduce-claude-code-token-usage-tools/) (une seule tâche : à lire comme des ordres de grandeur). **Écartés** après vérification : RTK (aucun gain mesuré indépendamment, installation `curl | sh`), claude-mem (stockage durable, pas de gain chiffré), alexgreensh/token-optimizer (licence non commerciale), claude-context (clés API payantes).

```bash
npx github:MehenniIslam/claude-agent-room advisor                  # la liste, les gains, les risques
npx github:MehenniIslam/claude-agent-room advisor check            # un dépôt a-t-il changé depuis la relecture ?
npx github:MehenniIslam/claude-agent-room advisor apply essentiel  # installer règles + Caveman + Context7
npx github:MehenniIslam/claude-agent-room advisor off              # ne plus jamais proposer
```

> [!IMPORTANT]
> **Garde-fous.** Liste fermée : un outil inconnu est refusé, même si un fichier ou une page le suggère à Claude. Avant chaque plugin, le dépôt est comparé au commit relu ; s'il a changé, tu vois le lien des différences et on te redemande. Jamais de `curl | sh`, de `sudo` ni de clé API. La proposition n'arrive qu'une fois par projet — et le compteur de coût montre ensuite l'effet réel.

## 🏋️ Taillée pour les gros projets

<details>
<summary><b>La chambre ne ralentit jamais Claude et ne plante pas — voici comment</b></summary>

<br>

| Où | Garde-fou |
|---|---|
| Hook | Tronque tout ce qui est gros (contenu de fichiers, diffs d'`Edit`/`MultiEdit`, sorties de commandes) : chaque envoi reste sous 200 Ko. stdin limité à 16 Mo ; au-delà, l'événement passe quand même (type et outil). Ne bloque jamais Claude : 700 ms max, silencieux. |
| Suivi de transcript | Relit la liste des fichiers toutes les 5 s seulement, ne suit que les transcripts des 48 dernières heures, lit par morceaux de 4 Mo et saute les lignes géantes au lieu de les charger. |
| Serveur | Historique de 400 événements, mémoire des sous-agents bornée, limite de débit généreuse (150 événements/s), onglet figé déconnecté plutôt que de remplir la mémoire. |
| Page web | 40 personnages max (les plus anciens au repos s'en vont), 500 fichiers suivis, 400 lignes de journal, fiche redessinée une fois par image, meubles pré-rendus. |
| Plugin | Au plus 6 agents en pause au salon, pour que le dessin reste sous la limite de taille du panneau. |
| Terminal | 10 images/s max, seulement quand quelque chose bouge ; 40 agents, 200 lignes de journal, 100 fichiers. |

</details>

## 🔒 Sécurité et confidentialité

La chambre voit passer tes prompts, tes commandes et tes chemins de fichiers. Elle est conçue pour que ça reste chez toi :

- **100 % local** — le serveur n'écoute que `127.0.0.1` et ne contacte aucun service externe (polices embarquées, pas de CDN, pas de télémétrie).
- **Les autres sites sont bloqués** — une page ouverte dans ton navigateur ne peut ni lire la chambre (WebSocket), ni y écrire (CSRF), ni la détourner par DNS rebinding.
- **Secrets masqués** — clés API (Anthropic, OpenAI, AWS, Google, Stripe…), tokens GitHub/GitLab/Slack/npm, JWT, clés privées, mots de passe dans une URL ou en `password=…` deviennent `[MASQUÉ]` avant même de quitter le hook.
- **Réseau = jeton obligatoire** — expose la chambre (`--host 0.0.0.0`) et un jeton est généré et exigé.
- **CSP stricte**, pas d'iframe, entrées filtrées et limitées en taille et en débit ; le suivi du coût ne lit que des `.jsonl` sous `~/.claude/projects`.

Modèle de menace et signalement d'une faille : [SECURITY.md](SECURITY.md).

## ⚙️ Configuration

<details>
<summary><b>Options du CLI et variables d'environnement</b></summary>

<br>

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
| | `AGENT_ROOM_MODE` | `fun` | `pro` : ambiance sobre (aussi dans `config.json` et dans la page) |
| | `AGENT_ROOM_HISTORY` | `1` | `0` : aucun journal sur disque |
| | `AGENT_ROOM_RETENTION_DAYS` | `14` | Jours de journal conservés (1 à 365) |
| | `AGENT_ROOM_LANG` | *(langue du système)* | `fr` ou `en` pour le mode terminal, la CLI, les messages du serveur et le conseiller tokens (comme `--lang`) |
| | `GITHUB_TOKEN` | | Facultatif : relève la limite de l'API GitHub pour `advisor check` |

Les réglages persistants sont dans `~/.claude/agent-room/config.json`. Toutes les commandes : `npx github:MehenniIslam/claude-agent-room --help`.

</details>

## 🩺 Dépannage

<details>
<summary><b>La chambre reste vide quand j'utilise Claude Code</b></summary>

<br>

1. Lance `npx github:MehenniIslam/claude-agent-room doctor` : il indique ce qui manque.
2. Vérifie que la chambre tourne **avant** de donner la tâche à Claude.
3. Relance Claude Code après l'installation des hooks (ils sont lus au démarrage), puis `/hooks` pour les voir.
4. Tu as changé de port ? Définis aussi `AGENT_ROOM_PORT` dans l'environnement de Claude Code.

</details>

<details>
<summary><b>« Le port 3030 est déjà utilisé »</b></summary>

<br>

Si c'est déjà la chambre, le CLI le détecte et te donne simplement l'URL. Sinon, choisis un autre port : `--port 3031`, et `AGENT_ROOM_PORT=3031` pour le hook.

</details>

<details>
<summary><b>Le badge affiche « Jeton requis »</b></summary>

<br>

Le serveur a été lancé avec un jeton (ou sur le réseau). Ouvre l'URL complète affichée dans le terminal, celle qui se termine par `?token=…`.

</details>

<details>
<summary><b>« node » n'est pas reconnu / version trop ancienne</b></summary>

<br>

Installe Node.js LTS depuis [nodejs.org](https://nodejs.org) (sous Windows : `winget install OpenJS.NodeJS.LTS`), puis ouvre un **nouveau** terminal.

</details>

<details>
<summary><b>Sous-agents en parallèle : un outil est attribué au mauvais agent</b></summary>

<br>

Claude Code n'indique pas toujours quel sous-agent appelle un outil. Le serveur utilise `agent_id` quand il est présent, sinon le dernier sous-agent actif, sinon Claude. Avec des sous-agents en parallèle, l'attribution peut être approximative. Le plugin n'a pas cette limite.

</details>

<details>
<summary><b>Tout désinstaller</b></summary>

<br>

```bash
npx github:MehenniIslam/claude-agent-room hooks remove
```

Puis supprime le dossier `~/.claude/agent-room/`. Pour le plugin : `/plugin uninstall agent-room`.

</details>

## 📡 API d'événements

Pilote la chambre depuis n'importe quel script (Anthropic SDK, serveur MCP, CI…) :

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

<br>

`POST /api/event` accepte un objet ou un tableau (200 max), ou directement un payload brut de hook Claude Code :

```jsonc
{
  "type": "SUBAGENT_SPAWN | TOOL_START | TOOL_END | AGENT_MESSAGE | SUBAGENT_COMPLETE | ERROR | NOTIFY | RESET",
  "agentId": "subagent-1",            // l'orchestrateur est "claude-main"
  "parentId": "claude-main",
  "role": "Coder | Researcher | Architect | Tester | Reviewer | Debugger",
  "name": "Agent-Front",
  "tool": "Read | Edit | Bash | Grep | Task",
  "message": "Je vérifie le composant d'authentification dans src/auth.ts…",
  "targetAgentId": "claude-main",
  "prompt": "Prompt complet affiché dans la fiche (SUBAGENT_SPAWN)",
  "file": "src/auth.ts",
  "success": true,                     // TOOL_END
  "kind": "done | waiting",            // NOTIFY
  "diff": "-ancienne ligne\n+nouvelle ligne", // TOOL_START sur une modification
  "added": 1, "removed": 1,
  "todos": [{ "content": "Écrire les tests", "status": "pending | in_progress | completed" }]
}
```

Seuls ces champs sont conservés (les autres sont ignorés) ; les textes sont tronqués et leurs secrets masqués.

| Route | Rôle |
|---|---|
| `POST /api/event` | Envoie un ou plusieurs événements |
| `POST /api/demo?speed=2` | Lance la démo (vitesse 0.25 à 4) |
| `POST /api/reset` | Vide la chambre |
| `GET /api/state` | Historique récent (400 événements) et statistiques |
| `GET /api/usage` | Tokens et coût estimé, par session et par agent |
| `GET /api/config` · `POST /api/config` | Lire / changer l'ambiance partagée (`{"mode":"pro"}`) |
| `GET /api/history` · `GET /api/export?day=&format=json\|csv` | Journal sur disque : liste des jours, export d'un jour |
| `GET /api/health` | Vérification simple, sans données |
| `WS /ws` | Flux temps réel ; l'historique est rejoué à la connexion. On peut aussi y envoyer des événements |

Avec un jeton : en-tête `x-agent-room-token: <jeton>` (ou `Authorization: Bearer <jeton>`), et `?token=<jeton>` pour le WebSocket. Les requêtes d'un navigateur doivent venir de la page de la chambre. Dans la console du navigateur, `roomDebug.emit({...})` injecte un événement localement.

</details>

<details>
<summary><b>Comment le pont traduit Claude Code</b></summary>

<br>

| Payload Claude Code | Événement chambre |
|---|---|
| `PreToolUse` sur `Task` / `Agent` | `SUBAGENT_SPAWN` (nom tiré de `subagent_type` ou `description`, rôle déduit) |
| `PreToolUse`, autres outils | `TOOL_START` (fichier, commande ou requête résumés ; plan et diff quand c'est pertinent) |
| `PostToolUse` | `TOOL_END` (+ `ERROR` si échec) |
| `PostToolUse` sur `Task` / `Agent`, ou `SubagentStop` | `SUBAGENT_COMPLETE` avec le début du rapport |
| `UserPromptSubmit` | Claude annonce la nouvelle demande |
| `Stop` · `Notification` | `NOTIFY` — Claude a fini · Claude attend ta réponse |

</details>

## 🧱 Architecture

```mermaid
flowchart LR
  CC["Claude Code"] -- "hooks (stdin JSON)" --> H["claude-hook.js<br/>masque les secrets"]
  H -- "POST /api/event" --> S["Serveur local<br/>Express + ws<br/>127.0.0.1:3030"]
  S -- "WebSocket /ws" --> B["Navigateur<br/>chambre isométrique"]
  S -- "WebSocket /ws" --> T["Terminal<br/>(tui)"]
  S -. "lit les compteurs de tokens" .-> TR["~/.claude/projects<br/>transcripts"]
  X["Tes scripts"] -. "POST / WS" .-> S
  CC -. "plugin (sans serveur)" .-> P["Panneau Agent Room"]
```

<details>
<summary><b>Organisation du dépôt</b></summary>

<br>

```
claude-agent-room/
├── bin/cli.js               # point d'entrée : setup, start, hooks, demo, watch, tui, advisor, doctor
├── server/
│   ├── index.js             # Express + ws : API, démo, diffusion temps réel
│   ├── security.js          # hôte, origine, jeton, débit, en-têtes
│   ├── normalize.js         # payloads Hooks Claude Code → événements chambre
│   ├── usage.js             # tokens et coût depuis les transcripts
│   ├── history.js           # journal sur disque, rejeu, export
│   └── config.js            # réglages persistants
├── bridge/
│   ├── claude-hook.js       # hook stdin → POST (+ masquage, conseiller tokens, mode --jsonl)
│   └── setup-hooks.js       # installe / retire les hooks
├── advisor/                 # conseiller tokens : catalogue vérifié, installation sûre, règles embarquées
├── public/                  # page web : moteur isométrique, 4 mondes, HUD, traductions (i18n.js), polices
├── tui/                     # la chambre dans le terminal
├── plugin/agent-room/       # plugin Claude Code : panneau SVG, suivi des fichiers
├── .claude-plugin/          # marketplace (rend le dépôt installable avec /plugin)
└── test/                    # npm test
```

</details>

## 🎨 Crée ton propre monde

Tous les mondes partagent la même disposition (postes, obstacles, chemins) ; un monde, c'est des textes, une **palette** et un **décor** peint une seule fois. Ajoute un objet dans `public/worlds.js` et enregistre-le dans `ROOM_WORLDS` :

```js
const spaceship = {
  id: 'spaceship', name: 'Vaisseau spatial', icon: '🚀', claudeTitle: 'Commandant',
  glyphs: ['✦', '01', '◉'],          // particules au-dessus des postes "code"
  status: { coding: 'Pilote', reading: 'Scanne', planning: 'Trace la route', bash: 'Teste les moteurs', coffee: 'En cabine' },
  pal: {                              // toute clé absente reprend la palette du Studio
    floorA: '#2a3140', floorB: '#303848', wallBack: '#1c2230', wallLeft: '#161b26', trim: '#5ef1ff',
    sky: '#05060f', sofa: '#3a4a6a', board: '#0f2a3a', boardInk: '#5ef1ff', night: 'rgba(0,10,30,0.3)'
  },
  decor({ planeS, planeE, floor, rand }) {
    for (const d of [70, 110]) planeE(0, d, 20, 16, 16, '#5ef1ff'); // hublots sur le mur de gauche
    floor(140, 120, 40, 4, '#5ef1ff');                               // bande lumineuse au sol
  }
};
root.ROOM_WORLDS = { studio, opera, garden, classroom, spaceship };
```

Les repères (tableau, fenêtre, bureaux…) et toutes les fonctions de dessin disponibles dans `decor` sont décrits en tête de `worlds.js`. Les meubles, les écrans et les personnages suivent automatiquement la palette.

## 🤝 Contribuer

```bash
npm install
npm run dev      # serveur relancé à chaque modification
npm test         # sécurité, masquage, hooks, coût, journal, conseiller, terminal
```

Les contributions sont bienvenues — un nouveau monde, un rôle d'agent, une nouvelle langue (copie le bloc `en` de `public/i18n.js`)… Ouvre une issue pour en discuter, ou directement une pull request. Les failles de sécurité se signalent en privé (voir [SECURITY.md](SECURITY.md)). Historique des versions : [CHANGELOG.md](CHANGELOG.md).

<details>
<summary><b>Publier sur npm</b></summary>

<br>

Pour que tout le monde puisse taper `npx claude-agent-room` : le nom est encore libre. Avec un compte npm, `npm login` puis `npm publish` (les tests tournent d'abord grâce à `prepublishOnly`). Ensuite, remplace `npx github:MehenniIslam/claude-agent-room` par `npx claude-agent-room` dans les deux README, `bin/cli.js`, `server/index.js`, `bridge/claude-hook.js` et `public/index.html`.

</details>

## 📄 Licence

[MIT](LICENSE). Polices embarquées : [Pixelify Sans](public/fonts/OFL-PixelifySans.txt) et [JetBrains Mono](public/fonts/OFL-JetBrainsMono.txt), sous licence SIL Open Font License 1.1. Règles d'économie : [drona23/claude-token-efficient](advisor/rules/LICENSE-drona23.txt) (MIT).

<div align="center">
<br>
<sub>Fait avec du ☕, des pixels et beaucoup de sous-agents.</sub>
</div>
