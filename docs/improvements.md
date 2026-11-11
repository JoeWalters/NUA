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

- [ ] **In-memory auth sessions.** The `sessions` Map is lost on restart.
  Switch to a signed/stateless cookie (HMAC/JWT); add CSRF/Origin verification on
  state-changing routes.
- [ ] **Fix lint debt.** Frontend: 287 errors (missing `prop-types`, `no-undef`
  in `useCurrentTheme.jsx`, unreachable code in `convertDigitsToDOTW.js`, parse
  errors in `traffic_rule_apps/nomatch.js`/`New_NoMatch.js`). Server: 318
  `no-console` warnings. Make lint a blocking CI gate.
- [ ] **Clean up `convertDigitsToDOTW.js`.** `break` after `return` is
  unreachable; the switch can return `undefined` for out-of-range digits.
- [ ] **Remove dead code.** Unused: `traffic_rule_apps/New_NoMatch.js`,
  `nomatch.js`, `temp2.js`, `see_all_apps/app_card/AppCard.jsx`,
  `SchedulerComponents/SelectOptionsComponent.jsx`, `CancelBonusTimeButton.jsx`,
  `DisplayBonusTimer.jsx`, `LoadingDialogTimer.js`, `TimerProvider.jsx`. The
  standalone `TrafficRules.jsx` screen is routed but not linked from the navbar.
- [ ] **Re-arm schedules server-side at boot.** Cron/easy schedules only
  re-initiate when the frontend calls `/checkjobreinitiation`. Re-arm on boot
  (like bonus timers) instead of relying on a client trigger.
- [ ] **Complete rate limiting.** Traffic-rule CRUD and device-group endpoints
  are unthrottled. Add a general API limiter.
- [ ] **Standardize error responses.** Some routes echo raw UniFi
  `error.response.data` (leaks internals), inconsistent status codes. Use one
  error envelope; gate internals behind diagnostics.

## Low priority / nice-to-haves

- [ ] **Add tests.** Only `node --check app.js` smoke test exists. Add unit
  tests for `credentialCrypto`, `auth`, and the scheduler modules.
- [ ] **Reduce schema duplication.** `TrafficRuleDevices`/`TargetDevice` and
  `AppCatIds`/`AppIds` are near-duplicate join tables.
- [ ] **Document env vars.** `.env.template` lacks `NUA_CORS_ORIGIN`, `NODE_ENV`,
  `AUTO_MIGRATE`, `PRISMA_CLI_QUERY_ENGINE_TYPE` (used by Dockerfile).
- [ ] **Update README.** Still documents pm2/manual install; Docker/Unraid is
  the primary deployment. Document Docker as the recommended path.

---

## Status log

| Date | Item | Notes |
|------|------|-------|
| 2026-11-11 | Initial review | Findings captured from deep-dive of the `cleanup/main-interface` branch. |
| 2026-11-11 | Refactor done | Split `app.js` into `server/routes/*` modules; removed debug/testing endpoints + `prisma.$disconnect()` calls. Verified: 0 lint errors, `node --check` passes, runtime `/health` + module routes respond. |
| 2026-11-11 | Deployed | Commit `2d9e8e5` pushed to `cleanup/main-interface`; GitHub Actions build succeeded (run 43069330221). Updated the `nua` container on trixie/unraid to the new `dev-latest` image (digest `8bceedec...`). Container healthy; `/getmacaddresses`, `/devicegroups`, `/getdbcustomapirules` all working. |
| 2026-11-11 | Device-group consolidation | Commit `31fc564` removed the dead `/devicegroups` API; `/api/device-groups` is canonical. Build succeeded (run 43078925725); container updated to digest `cb1b1d4e...`. Verified: `/devicegroups` now falls through to SPA shell (old API gone), `/api/device-groups` + schedules working. |
| 2026-11-11 | Auth SPA-fallback fix | Commit `6f7060c` added `'**'` to `PUBLIC_PATHS` so the SPA shell is always served without auth. Build succeeded (run 43081290694); container updated to digest `795899b7...`. Verified: `/trafficrules` serves the HTML shell (200, text/html), container healthy. |
