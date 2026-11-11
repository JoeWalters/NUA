# NUA — Agent Working Notes

## What this is

NUA is a Node.js web app for managing UniFi Cloud Gateway devices (block/unblock,
traffic rules, speed limits, schedules, bonus time). Frontend: React 18 + Vite +
Tailwind/daisyUI. Backend: Express 4 + Prisma/SQLite + `node-unifi` +
`node-schedule`. Runs via Docker on a local Unraid server.

## Current state (as of 2026-11-11)

- **Branch:** `cleanup/main-interface` (working branch). Pushed commits trigger
  the Docker Image CI workflow.
- **Recent refactors (all deployed & verified):**
  - `2d9e8e5` — Split `server/app.js` (3,672 lines) into route modules under
    `server/Routes/` (health, devices, schedules, settings, device-groups,
    traffic-rules). Shared `ctx` object; mutable UniFi connection exposed via
    `getUnifi()`. Removed debug/testing endpoints (`/getallworking`,
    `/submitapptest`, `/deletetestids`, `/debug/migration-status`,
    `/getdeviceinfo`) and the `prisma.$disconnect()` calls.
  - `31fc564` — Removed the dead `/devicegroups` API; `/api/device-groups` is
    the single canonical device-group API.
  - `6f7060c` — Added `'**'` to `PUBLIC_PATHS` so the SPA fallback always serves
    the shell without auth (login page always loads).
- **Deployed:** the `nua` container runs the latest `joewalters/nua:dev-latest`
  image; healthy. Auth is disabled on the running instance.

## Build & deploy workflow

1. `git add ... && git commit` (concise message).
2. `git push origin cleanup/main-interface` → triggers GitHub Actions build.
3. Poll build status via the GitHub Actions API and wait for `conclusion: success`.
4. Update the Unraid container (see `AGENTS.local.md` for the exact commands and
   environment-specific details).

## Key operational notes

- **`updateContainer` needs the container ID** (not the name `nua`); the name
  returns "Container nua not found". Avoid `updateAllContainers` (it updates
  every container with a pending update).
- **Auth is optional** (`NUA_AUTH_*` env vars); disabled by default.
- **`/debug-status` is kept** (used by the Settings modal) — don't remove it.

## Improvement backlog

Tracked in `docs/improvements.md` (checkboxes + status log). High-priority items
are done except the skipped `NODE_ENV=development` Docker fix. Remaining:
medium-priority (in-memory auth sessions, lint debt, dead code, server-side
schedule re-arm on boot, rate limiting, error responses) and low-priority
(tests, schema duplication, env docs, README update).

## Conventions

- Server lint: `cd server && npx eslint .` — must stay at **0 errors**.
- `node --check` on changed files before committing.
- Route modules register via `registerX(app, ctx)`; add deps to `ctx` in app.js
  (each destructured dep must exist there — verify).
- New route modules go in `server/Routes/` (capital `R`; the Docker/Linux build
  is case-sensitive).
