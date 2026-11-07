# Sécurité

## Ce que voit la chambre

Les hooks Claude Code transmettent à la chambre les prompts, les commandes lancées, les chemins de fichiers et le début des réponses d'outils. Ces données restent **sur ta machine** : le hook n'envoie qu'au serveur local (`http://127.0.0.1:3030` par défaut) et le serveur ne contacte aucun service externe (polices embarquées, aucune télémétrie, aucun CDN).

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
| `settings.json` corrompu | Sauvegarde horodatée avant chaque modification, écriture atomique, hooks existants conservés |

Le masquage des secrets fonctionne par motifs : il attrape les formats courants mais **ne peut pas garantir** de tout reconnaître. Évite de projeter la chambre en public pendant que Claude manipule des secrets.

## Exposer la chambre sur le réseau

```bash
HOST=0.0.0.0 AGENT_ROOM_TOKEN="$(openssl rand -hex 24)" npm start
```

Ouvre l'URL `…/?token=…` affichée dans le terminal (le jeton est ensuite retiré de la barre d'adresse et gardé pour l'onglet). Côté hook, définis les mêmes `AGENT_ROOM_TOKEN` et `AGENT_ROOM_URL=http://<machine>:3030/api/event`. Le trafic n'est pas chiffré : réserve cet usage à un réseau de confiance, ou place un proxy HTTPS devant.

## Signaler une faille

Merci de ne pas ouvrir d'issue publique. Utilise **Security → Report a vulnerability** sur la page GitHub du dépôt (signalement privé), avec les étapes pour reproduire.
