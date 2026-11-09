# Contributing · Contribuer

Thanks for helping! / Merci de ton aide ! Issues and pull requests are welcome in **English or French**.

## Two products, one repo · Deux produits, un dépôt

| Folder | What | Check with |
|---|---|---|
| `plugin/agent-room/` | The Claude Code plugin: the room as an animated SVG in a panel | `claude plugin test plugin/agent-room` · `claude plugin validate .` |
| `server/` `bridge/` `public/` `tui/` `bin/` `advisor/` | The website, the hooks, the terminal mode, the CLI, the token advisor | `npm test` |

## Get started · Démarrer

```bash
git clone https://github.com/MehenniIslam/claude-agent-room.git
cd claude-agent-room
npm install
npm run dev      # server restarts on every change → http://localhost:3030
npm run demo     # plays a full mission without spending a token
npm test
```

Try the plugin from your clone: `claude plugin install agent-room --marketplace "$PWD"`, then `/reload-plugins` after each change.

## Rules · Règles

- **One bug fixed = one test added.** CI runs on Node 18 → 24, Linux, Windows and macOS, plus the plugin checks.
- **No hard-coded text.** Every string exists in English and French: `public/i18n.js` (website, terminal mode), `bin/i18n.js` (CLI, setup, hooks, advisor, server logs). A test checks both languages have the same keys and `{variables}`.
- **The hook never blocks Claude**: no output, exit code 0, 700 ms max. A plugin error must never block a tool (`.catch(next)`).
- **Security first**: the server listens on `127.0.0.1`, checks `Host` and `Origin`, masks secrets. Read [SECURITY.md](SECURITY.md) before touching `server/security.js` or `bridge/claude-hook.js`.
- **Plugin changed?** Bump `version` in `plugin/agent-room/.claude-plugin/plugin.json` so `claude plugin update` sees it.
- Small commits, [Conventional Commits](https://www.conventionalcommits.org) style: `feat(plugin): …`, `fix(site): …`, `docs: …`.

## Releasing · Publier une version

1. Bump `version` in `package.json`, then `npm install --package-lock-only`.
2. Add a `## X.Y.Z` section at the top of `CHANGELOG.md`.
3. Merge to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`: the GitHub release is created automatically with the changelog notes.

## Ideas · Idées

A new world (see *Make your own world* in the README), an agent role, a new language (copy the `en` block of both `i18n.js` files)… Open an issue to talk about it, or go straight to a pull request.
