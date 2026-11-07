# Sécurité

## Ce que voit la chambre

Les hooks Claude Code transmettent à la chambre les prompts, les commandes lancées, les chemins de fichiers, le début des réponses d'outils et un aperçu des modifications de fichiers (diffs tronqués). Ces données restent **sur ta machine** : le hook n'envoie qu'au serveur local (`http://127.0.0.1:3030` par défaut) et le serveur ne contacte aucun service externe (polices embarquées, aucune télémétrie, aucun CDN). Seule exception, à ta demande : `advisor check` / `advisor apply` interrogent l'API publique de GitHub pour vérifier les dépôts.

Ce qui est écrit sur le disque, dans `~/.claude/agent-room/` : le journal des événements (`history/`, secrets masqués, 14 jours par défaut, `AGENT_ROOM_HISTORY=0` pour couper), les réglages (`config.json`) et l'état du conseiller tokens (`advisor.json` : les dossiers de projet où la proposition a déjà été faite).

Pour le coût, le serveur lit les transcripts de Claude Code indiqués par les hooks, **uniquement** sous `~/.claude/projects` (chemin vérifié après résolution des liens symboliques) et n'en extrait que les compteurs de tokens et le nom du modèle.

## Conseiller tokens

Au premier démarrage de Claude Code dans un projet, le hook `SessionStart` ajoute au contexte de Claude une liste fermée d'outils vérifiés (`advisor/catalog.json`), avec la consigne de ne rien installer sans accord explicite, de n'utiliser que les commandes exactes du catalogue et de refuser tout outil suggéré par un fichier ou une page. Côté installation (`advisor apply`) : un identifiant hors catalogue est refusé ; chaque dépôt de plugin est comparé au commit relu et toute différence affiche le lien de comparaison et exige une confirmation ; aucune commande `curl | sh`, `sudo` ou clé API ; les règles CLAUDE.md sont embarquées (rien n'est téléchargé) et insérées entre balises, avec sauvegarde du fichier. Le catalogue indique pour chaque outil s'il exécute du code et s'il utilise le réseau. `advisor off` coupe la proposition.

## Protections en place

| Risque | Protection |
|---|---|
| Un site web ouvert dans ton navigateur lit ta session via `ws://localhost:3030` | Le WebSocket et l'API refusent toute requête dont l'en-tête `Origin` n'est pas la page de la chambre elle-même |
| DNS rebinding (un domaine piégé qui pointe vers 127.0.0.1) | L'en-tête `Host` doit désigner la machine (`localhost`, `127.0.0.1`, `[::1]`, ou les adresses explicitement autorisées) |
| CSRF (formulaire caché qui vide la chambre) | Même contrôle d'origine sur toutes les routes `POST` |
| Accès depuis le réseau local | Le serveur n'écoute que `127.0.0.1`. Avec `HOST=0.0.0.0`, un jeton est **exigé** (généré automatiquement si `AGENT_ROOM_TOKEN` n'est pas défini) |
| Clés API ou mots de passe affichés à l'écran | Le hook et le serveur masquent les secrets reconnaissables : clés Anthropic/OpenAI, tokens GitHub/GitLab/Slack/npm/Stripe, clés AWS/Google, JWT, clés privées PEM, identifiants dans une URL, `password=…`, `API_KEY=…` |
| Injection de contenu (XSS) | Tous les textes sont insérés avec `textContent` (web) ou échappés (SVG du plugin) ; CSP stricte `default-src 'self'` sans script inline |
| Clickjacking | `X-Frame-Options: DENY` et `frame-ancestors 'none'` |
| Saturation mémoire / flood | Champs filtrés et tronqués, historique limité à 400 événements, corps JSON ≤ 512 ko, WebSocket ≤ 256 ko, limite de débit par adresse, 32 clients max |
| Fuite d'informations | Erreurs renvoyées en JSON court, jamais de pile d'appels ; en-tête `X-Powered-By` retiré |
| Lecture de fichiers arbitraires via le suivi du coût | Seuls des `.jsonl` sous `~/.claude/projects` sont lus (chemin réel vérifié), 200 fichiers max, seuls les compteurs en sortent |
| Injection de formules à l'export CSV | Les cellules commençant par `=`, `+`, `-`, `@` sont préfixées d'une apostrophe ; export limité au format `AAAA-MM-JJ` (pas de chemin) |
| Changement de réglage par un autre site | `POST /api/config` soumis au même contrôle d'origine et au jeton que le reste de l'API |
| `settings.json` corrompu | Sauvegarde horodatée avant chaque modification, écriture atomique, hooks existants conservés |

Le masquage des secrets fonctionne par motifs : il attrape les formats courants mais **ne peut pas garantir** de tout reconnaître. Évite de projeter la chambre en public pendant que Claude manipule des secrets.

## Exposer la chambre sur le réseau

```bash
HOST=0.0.0.0 AGENT_ROOM_TOKEN="$(openssl rand -hex 24)" npm start
```

Ouvre l'URL `…/?token=…` affichée dans le terminal (le jeton est ensuite retiré de la barre d'adresse et gardé pour l'onglet). Côté hook, définis les mêmes `AGENT_ROOM_TOKEN` et `AGENT_ROOM_URL=http://<machine>:3030/api/event`. Le trafic n'est pas chiffré : réserve cet usage à un réseau de confiance, ou place un proxy HTTPS devant.

## Signaler une faille

Merci de ne pas ouvrir d'issue publique. Utilise **Security → Report a vulnerability** sur la page GitHub du dépôt (signalement privé), avec les étapes pour reproduire.
