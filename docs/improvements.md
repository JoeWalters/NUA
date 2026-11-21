# NUA Improvement Tracker

This document records findings from the project deep-dive review (2026-11-11) so
they are not lost. Check items off as they are completed. See `git log` / commit
messages for the implementation of each item.

## How to use

- `[x]` = done
- `[ ]` = pending
- Each item links to the relevant area. Add the commit(s) that resolve it next to
  the checkbox when finished.

---

## UniFi Network 11.x compatibility (2026-11-21)

UniFi Network **11.0.99** auto-upgraded this site (from 10.6.109) and
**silently broke per-device speed limiting**: the legacy `trafficrules` API
(`POST /v2/api/site/default/trafficrules`, which NUA used for its `bandwidth_limit`
mechanism) now returns **HTTP 501 `api.err.NotImplemented`**, and the upgrade
**wiped the existing traffic rules** (controller `trafficrules` is now empty). NUA
had no detection — it surfaced a raw `501`/`api.err.NotImplemented` to the UI.

**Root cause / mechanism found (investigated read-only against the live 11.0.99
controller, confirmed against the vendor V11 OpenAPI spec and cross-checked with
independent agents):**
- Per-device speed limiting **moved to the `qos-rules` store**
  (`/v2/api/site/default/qos-rules`), where a cap is a rule with
  `objective: "LIMIT_AND_PRIORITIZE"` (the UI's "Limit"), addressed by the device
  MAC as the rule's **source** (`source.client_macs`), capping **any destination**
  (`destination.matching_target: "ANY"`). Schema: `name`, `source`, `destination`,
  `objective`, `download_limit_kbps`, `upload_limit_kbps`, `download_burst`,
  `upload_burst`, `enabled`, `schedule`, `index`. Writes need `X-CSRF-Token`
  (node-unifi already carries it); `PATCH` is 405 so a full-object `PUT` is
  required; `index` is assigned by the controller on create.
- The 3 pre-upgrade speed limits migrated to `qos-rules` but were left
  **disabled** (`Cap J school`, `Cap D School lap`, `LR Throttle YouTube`).
- Block/allow rules appear to live in `firewall-policies` (79 present) — a
  **separate** store from the speed-limit re-map; out of scope here.
- Option 2 (per-user WiFi Speed Limit via `rest/usergroup`) is inert on a UDM —
  the `qos-rules` store is the working one.

- [x] **Graceful degradation + ghost-rule cleanup (Option D).** Detect the 501 and
  return a clear user message instead of a raw error; prune DB "ghost" rows whose
  `unifiId` no longer exists on the controller. `server/Routes/traffic-rules.js`:
  `isUnsupportedFeatureError`, `sendUnsupportedFeature` (wired into the 5 write/
  toggle handlers), and `POST /reconciletrafficrules` (prunes ghosts, dry-run
  supported, safe-by-construction — a failed controller read aborts without
  deleting). Committed `8c13c0e`; deployed to Unraid. Ran reconcile: pruned 7
  ghost DB rows; verified a create now returns a clean 501 with no DB row.
- [~] **Re-map speed limiting to `qos-rules` (Option 1, the real fix).** New
  `server/server_util_funcs/qosRules.js` is a translation shim so the existing UI/
  DB keep working untouched: `buildQosRuleFromSpeedLimit` (create → qos-rule
  POST), `qosRuleToLegacy` (qos-rule → old shape for read/import), `isQosRule`
  (route toggle/update/delete to the right store). `traffic-rules.js` now:
  `addspeedlimittrafficrule` POSTs to `qos-rules` (MAC-based, no IP needed);
  `getdbcustomapirules` merges translated `qos-rules` into `unifiData` (best-effort
  fetch); toggle/update/delete route QoS rules to `qos-rules` (GET live → mutate →
  full PUT). **Note:** scheduled/bonus-time for speed-limit rules still target the
  dead `trafficrules` store (`scheduler/trafficRuleScheduler.js`,
  `trafficBonusScheduler.js`) — a follow-up is needed for time-limited caps.
- [ ] **Re-import the 3 migrated qos-rules into NUA's DB** so they show in the UI
  (they exist on the controller, left disabled by the upgrade). Via the existing
  `importexistingunifirules` flow now that `getdbcustomapirules` surfaces them.
- [ ] **Follow-up: re-map scheduled/bonus time + block/allow rules** to `qos-rules`
  / `firewall-policies` respectively.

---

## High priority

- [x] **Refactor `server/app.js` route modules.** The single 3,600+ line file
  mixes middleware, auth, helpers, and every route group. Split into
  `server/routes/*` modules (health, devices, schedules, settings,
  device-groups, traffic-rules) that receive a shared context. `app.js` is now
  ~790 lines; the route modules share one `ctx` object (mutable UniFi
  connection exposed via `getUnifi()`).
- [x] **Remove debug/testing endpoints + `prisma.$disconnect()` calls.** Deleted
  `/getallworking`, `/submitapptest`, `/deletetestids`, `/debug/migration-status`,
  and the dead `/getdeviceinfo`; removed the `prisma.$disconnect()` calls in
  `deletecustomapi` / `unmanageapp` (they closed the shared connection pool).
  `/debug-status` was kept (still used by the Settings modal).
- [x] **Consolidate duplicate device-group APIs.** `/devicegroups` (old) and
  `/api/device-groups` (newer REST style) were two parallel implementations with
  drift risk. The frontend (DeviceGroupManager) only ever used `/api/device-groups`,
  so the old `/devicegroups` endpoints (GET/POST/PUT/DELETE, `/devices/:id/group`,
  `/devicegroups/:id/toggle`) were removed from `server/Routes/device-groups.js`.
  `/api/device-groups` is now the single canonical API.
- [ ] **Fix `NODE_ENV=development` in the runtime Docker stage.** The startup
  script's `production` branch (`migrate deploy`) is never taken, so it always
  auto-migrates via `npm run db`. Set `NODE_ENV=production` + deterministic
  `migrate deploy`; simplify the fragile drift-reconciliation logic.
- [x] **Fix auth SPA-fallback edge case.** `app.get('**')` is registered after
  the auth-wrapping override, so with auth enabled a hard refresh on a deep
  route returned a 401 JSON instead of the HTML shell. Added `'**'` to
  `PUBLIC_PATHS` in `server_util_funcs/auth.js` — the client-side shell (and
  login screen) is always served; auth protects the data APIs, not the shell.

## Medium priority

- [~] **In-memory auth sessions.** The `sessions` Map is lost on restart.
  Switch to a signed/stateless cookie (HMAC/JWT); add CSRF/Origin verification on
  state-changing routes. **Skipped** — auth is optional and disabled by default;
  the user has no plans to enable it, so this is a non-goal. Revisit only if
  auth is ever turned on.
- [x] **Fix lint debt.** Frontend: 287 errors (missing `prop-types`, `no-undef`
  in `useCurrentTheme.jsx`, unreachable code in `convertDigitsToDOTW.js`, parse
  errors in `traffic_rule_apps/nomatch.js`/`New_NoMatch.js`). Server: 318
  `no-console` warnings. Make lint a blocking CI gate. Fixed the genuine bugs
  (`convertDigitsToDOTW.js` unreachable/undefined, `useCurrentTheme.jsx` missing
  React imports, `convertSelectedDate.js` extra semi, `no-unescaped-entities`),
  deleted the dead/broken `nomatch.js`/`New_NoMatch.js`, scoped frontend lint to
  `src/` (ignoring `server/` + build configs), disabled `react/prop-types` and
  `no-console` (codebase doesn't use PropTypes; Node server legitimately logs),
  disabled `no-unused-vars` (dead code tracked separately), and made the CI
  frontend lint step a blocking gate.
- [ ] **Clean up `convertDigitsToDOTW.js`.** `break` after `return` is
  unreachable; the switch can return `undefined` for out-of-range digits.
- [x] **Remove dead code.** Unused: `traffic_rule_apps/New_NoMatch.js`,
  `nomatch.js`, `temp2.js`, `see_all_apps/app_card/AppCard.jsx`,
  `SchedulerComponents/SelectOptionsComponent.jsx`, `CancelBonusTimeButton.jsx`,
  `DisplayBonusTimer.jsx`, `LoadingDialogTimer.js`, `TimerProvider.jsx`. The
  standalone `TrafficRules.jsx` screen is routed but not linked from the navbar.
  Deleted `temp2.js`, `AppCard.jsx`, `SelectOptionsComponent.jsx`,
  `CancelBonusTimeButton.jsx`, `DisplayBonusTimer.jsx`, `LoadingDialogTimer.js`,
  `TimerProvider.jsx` (all confirmed unreferenced). `nomatch.js`/`New_NoMatch.js`
  were already removed in the lint-debt fix. `TrafficRules.jsx` was kept — it is
  reachable via `SeeAllApps` navigation (`navigate('/trafficrules')`), so it is
  not dead code.
- [x] **Re-arm schedules server-side at boot.** Cron/easy schedules only
  re-initiate when the frontend calls `/checkjobreinitiation`. Re-arm on boot
  (like bonus timers) instead of relying on a client trigger. Added
  `server/scheduler/deviceScheduler.js` (`reArmDeviceSchedulesOnBoot`) and wired
  it into the `app.js` boot sequence; re-armed jobs pass `unifi`/`prisma` into
  `jobFunction` (the `/checkjobreinitiation` path omitted them — a latent bug).
- [x] **Complete rate limiting.** Traffic-rule CRUD and device-group endpoints
  are unthrottled. Add a general API limiter. Added a general `apiLimiter`
  (60 req/min) in `server/app.js` applied to all state-changing routes
  (POST/PUT/DELETE); GET/HEAD/OPTIONS are skipped so static assets, the SPA
  shell, and `/health` are never throttled.
- [x] **Standardize error responses.** Some routes echo raw UniFi
  `error.response.data` (leaks internals), inconsistent status codes. Use one
  error envelope; gate internals behind diagnostics. Standardized `sendError` in
  `server/app.js` to a single envelope (`{ success: false, error: <generic>,
  details?: <gated> }`); replaced the 4 raw `error?.response?.data` echoes in
  `traffic-rules.js` with `sendError`; passed `sendError` into `ezScheduleRoutes`
  so it gates `error.message` behind diagnostics instead of always leaking it;
  updated the traffic-rule modals to read the safe message.

## Low priority / nice-to-haves

- [x] **Add tests.** Only `node --check app.js` smoke test exists. Add unit
  tests for `credentialCrypto`, `auth`, and the scheduler modules. Added
  `server/test/` tests using the built-in `node:test` runner (26 tests):
  `credentialCrypto.test.js`, `auth.test.js`, `scheduler.test.js` (scheduler
  service helpers + boot-time re-arm functions with mocked Prisma). Tests
  caught a real bug — a duplicate `module.exports` in `start_end_timeouts.js`
  dropped `startTimeoutFromExpiry` from the exports (would crash bonus-time
  re-arm at boot) — now fixed. `npm test` runs them; CI added a server test step.
- [ ] **Reduce schema duplication.** `TrafficRuleDevices`/`TargetDevice` and
  `AppCatIds`/`AppIds` are near-duplicate join tables.
- [ ] **Document env vars.** `.env.template` lacks `NUA_CORS_ORIGIN`, `NODE_ENV`,
  `AUTO_MIGRATE`, `PRISMA_CLI_QUERY_ENGINE_TYPE` (used by Dockerfile).
- [x] **Update README.** Still documents pm2/manual install; Docker/Unraid is
  the primary deployment. Document Docker as the recommended path. Added a
  Docker (recommended) section with build/run/health-check steps, kept the manual
  install as an alternative, added an Environment variables table, and updated the
  background/autostart section to recommend `--restart` (pm2 is now only for the
  manual path). No sensitive data (hosts, IPs, credentials, container IDs) is
  shared — placeholders used throughout.

---

## Status log

| Date | Item | Notes |
|------|------|-------|
| 2026-11-11 | Initial review | Findings captured from deep-dive of the `cleanup/main-interface` branch. |
| 2026-11-11 | Refactor done | Split `app.js` into `server/routes/*` modules; removed debug/testing endpoints + `prisma.$disconnect()` calls. Verified: 0 lint errors, `node --check` passes, runtime `/health` + module routes respond. |
| 2026-11-11 | Deployed | Commit `2d9e8e5` pushed to `cleanup/main-interface`; GitHub Actions build succeeded (run 43069330221). Updated the `nua` container on trixie/unraid to the new `dev-latest` image (digest `8bceedec...`). Container healthy; `/getmacaddresses`, `/devicegroups`, `/getdbcustomapirules` all working. |
| 2026-11-11 | Device-group consolidation | Commit `31fc564` removed the dead `/devicegroups` API; `/api/device-groups` is canonical. Build succeeded (run 43078925725); container updated to digest `cb1b1d4e...`. Verified: `/devicegroups` now falls through to SPA shell (old API gone), `/api/device-groups` + schedules working. |
| 2026-11-11 | Auth SPA-fallback fix | Commit `6f7060c` added `'**'` to `PUBLIC_PATHS` so the SPA shell is always served without auth. Build succeeded (run 43081290694); container updated to digest `795899b7...`. Verified: `/trafficrules` serves the HTML shell (200, text/html), container healthy. |
| 2026-11-11 | Device schedule re-arm on boot | Added `server/scheduler/deviceScheduler.js` (`reArmDeviceSchedulesOnBoot`) and wired it into the `app.js` boot sequence, so cron/easy schedules restore server-side instead of relying on the frontend `/checkjobreinitiation`. Re-armed jobs pass `unifi`/`prisma` into `jobFunction`. |
| 2026-11-11 | General API rate limiter | Added a general `apiLimiter` (60 req/min) in `server/app.js` covering all state-changing API routes (POST/PUT/DELETE); GET/HEAD/OPTIONS skipped so static assets, the SPA shell, and `/health` are never throttled. |
| 2026-11-11 | Lint debt | Fixed frontend lint errors (unreachable/undefined code, missing React imports, extra semicolons, unescaped entities, parse errors from deleted dead files); scoped frontend lint to `src/`; disabled `react/prop-types`, `no-console`, and `no-unused-vars` (dead code tracked separately); made the CI frontend lint step a blocking gate. Frontend + server lint now pass with 0 errors. |
| 2026-11-11 | Dead code removal | Deleted 7 unreferenced files (`temp2.js`, `AppCard.jsx`, `SelectOptionsComponent.jsx`, `CancelBonusTimeButton.jsx`, `DisplayBonusTimer.jsx`, `LoadingDialogTimer.js`, `TimerProvider.jsx`). Kept `TrafficRules.jsx` (reachable via `SeeAllApps` navigation). Frontend build + lint pass. |
| 2026-11-11 | Error responses | Standardized `sendError` to `{ success: false, error: <generic>, details?: <gated> }`; replaced 4 raw `error?.response?.data` echoes in `traffic-rules.js`; passed `sendError` into `ezScheduleRoutes` to gate `error.message`; updated traffic-rule modals to read the safe message. Server lint + frontend build/lint pass. |
| 2026-11-11 | README update | Documented Docker as the recommended path (build/run/health-check), kept manual install as an alternative, added an Environment variables table, and updated background/autostart to recommend `--restart`. No sensitive data shared. |
| 2026-11-11 | Tests | Added `server/test/` unit tests (26) using `node:test` for `credentialCrypto`, `auth`, and the scheduler modules. Tests exposed a real bug in `start_end_timeouts.js` (duplicate `module.exports` dropped `startTimeoutFromExpiry`) — fixed. `npm test` runs them; CI now runs a server test step. |
| 2026-11-21 | UniFi 11.x diagnosed | UniFi Network 11.0.99 (auto-upgraded from 10.6.109) returns 501 `NotImplemented` on `POST /v2/api/site/default/trafficrules` and wiped the old rules. Per-device speed limiting moved to the `qos-rules` store (`objective: LIMIT_AND_PRIORITIZE`, device MAC as source, `ANY` destination). Investigated read-only against the live controller + V11 OpenAPI spec; cross-checked with independent agents. |
