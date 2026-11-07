# Changelog

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
