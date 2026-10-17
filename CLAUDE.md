# Notes for Claude

- Talk to the user in Latvian. See README.md for the game.
- This folder is the git clone of GitHub `Forshais/math-duel` (branch main) — the single source of truth. (`C:\Users\Home\Documents\math-duel` is an older clone; `C:\!Klods\math-duel-v0.1-vecais` is the old v0.1 copy.)
- Main host — Klods server (Hetzner): https://dueli.89-167-48-48.sslip.io (systemd `dueli`, port 3000, file storage `data/players.json` + daily backup). Server notes: `C:\!Klods\Serveris\CLAUDE.md`.
- App download page for friends: https://dueli.89-167-48-48.sslip.io/install (PWA: manifest + sw.js + icons in `public/icons`).
- Also on Render (free, Neon Postgres via DATABASE_URL): https://matematikas-duelis.onrender.com — auto-deploys on every push to main.
- Publish only when the user asks: `git push` (Render) and `sh "/c/!Klods/Serveris/deploy.sh" dueli` (Hetzner; uploads `server.js`, `package.json`, `lib/`, `public/`, never `data/`). A restart ends running duels.
- No system Node: use `/c/Program Files/Adobe/Adobe Photoshop 2025/node.exe`. Test: run the server with `PORT=3456`, then `node test/duel.test.mjs`.
