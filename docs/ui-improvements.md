# NUA UI improvements — backlog & progress

Tracking doc for UI/UX work on the React frontend (`src/`). Findings come from a
reconnaissance pass over the codebase; every item is anchored to `file:line` evidence.
**Update the status column and the progress log as work lands** so this stays the single
source of truth for UI debt.

- Last updated: 2026-11-24
- Scope: `src/` (frontend) plus the API shapes it consumes. Server behaviour unchanged by UI rounds.
- How to verify any claim here: open the app and check the cited line, or re-run the cited grep.

> **Tracking:** the remaining items below are filed as cards on the Forgejo board in
> `jwalters/infrastructure-configs` (`scripts/board.sh`), column **New**, labelled `ai-draft`.
> Card numbers are listed in each row's Notes cell. A human promotes a card to `Ready`; agents may
> only file into `New`. The six completed items were closed out in-repo rather than filed.

## Status key

| Symbol | Meaning |
|---|---|
| ✅ | Done and verified |
| 🚧 | In progress |
| ⬜ | Accepted, not started |
| 🔍 | Needs a decision from the owner |
| ❌ | Rejected / by design |

---

## Owner decisions (recorded 2026-11-24)

1. **Navigation: by design.** The multiple separate pages were deliberately collapsed into a
   single pane of glass. Do **not** add a nav shell or tabs for the other routes. The only
   navigation change wanted was moving the **Activity Log trigger into the top navbar** — done.
   The `AllDevices` / `BlockedDevices` / `SeeAllApps` / `ManageApp` routes may be dead code; that
   is a separate decision, not part of this round.
2. **Dark mode:** fix it.
3. **Tailwind class typos:** fix.
4. **`src/components/Devices.jsx`:** delete (unreachable duplicate screen).
5. **Action feedback (toasts):** fix.
6. **Empty states:** fix.

---

## Tier 1 — high value, small effort

| # | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Navigation between screens | ❌ by design / ✅ Activity Log moved | `src/main.jsx`, `src/components/Navbar.jsx`, `src/App.jsx` | Owner: single pane of glass is intentional. Activity Log trigger now lives in the navbar `controls` fragment (inline on md+, in the mobile dropdown), opening the modal rendered from `App.jsx`. Four unreachable routes were later deleted — see "Dead route cleanup" below. |
| 2 | Dark mode | ✅ | `index.html`, `src/utility_functions/applyTheme.js`, `src/App.jsx:53-56`, `Scheduler/SchedulerComponents/CronScheduleTable.jsx:5`, `EZScheduleTable.jsx:6` | See "Dark mode: what was actually wrong" below — the original diagnosis in the recon report was incorrect and is corrected there. |
| 3 | Two Tailwind classes never compiled | ✅ | `src/components/see_all_apps/SeeAllApps.jsx:757` | `2xl-grid-cols-1` / `xl-grid-cols-1` → `2xl:grid-cols-1` / `xl:grid-cols-1`. |
| 4 | Delete `src/components/Devices.jsx` | ✅ | deleted (was 336 lines) | Unreachable; a second copy of all five device mutations and the only `alert()` user in the codebase. |
| 5 | No success/failure feedback on primary actions | ✅ | `src/components/custom_hooks/useDeviceActions.js`, `PauseButton.jsx`, `BonusTimeButton.jsx` | Toast on both branches for toggle / block-all / unblock-all / delete / save-edits; `showToast` threaded PolicyList→card and ModernDevices→grid→card→buttons. |
| 6 | Missing empty states | ✅ | `src/components/all_devices/AllDevices.jsx`, `src/components/blocked_device/BlockedDevices.jsx` | All Devices distinguishes "no matches" (with Clear filters) from "nothing discovered yet"; Blocked Devices has a "nothing blocked" state. |

## Tier 2 — medium value, medium effort

| # | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| 7 | No sorting; default order is arbitrary | ⬜ | `src/components/PolicyList.jsx:242-275`, `src/components/modern_devices/ModernDeviceGrid.jsx:44-84` | **Board:** #21. Proposed: sort by name/status/last-seen, default blocked+paused first, persist in `localStorage`. |
| 8 | Every single-device mutation refetches the whole list | ⬜ | `useDeviceActions.js` `onDataChange` → `AdminConsole.jsx:102` → `AdminConsole.jsx:67`; `all_devices/useFetchAllDevices.jsx:42` | **Board:** #22. Mutation responses already return the updated device, so an optimistic local update is possible. |
| 9 | No shared data layer; duplicate fetches | ⬜ | `/getcurrentdevices` from 3 sites: `traffic_rules/CreateRuleModal.jsx:300`, `SpeedLimitModal.jsx:46`, `EditRuleModal.jsx:47`; `/getalldevices` from `useFetchAllDevices.jsx:42` and `custom_hooks/useGetAllDevices.jsx:15` | **Board:** #23. No react-query/SWR/context in `package.json` or `src/`. Proposed: one `DevicesProvider`. |
| 10 | Form failures invisible to the user | ⬜ | `src/components/EasySched.jsx:214` (state set, never rendered), `AddDeviceModal.jsx:23`, `CronManager.jsx:90` | **Board:** #24. AddDevice also has no MAC validation. |
| 11 | Raw cron expressions shown to users | ⬜ | `CronManager.jsx:150`, `SchedulerComponents/CronScheduleTable.jsx` | **Board:** #25. Proposed human-readable description beside each row. |
| 12 | Accessibility sweep | ⬜ | Icon-only steppers in `BonusTimeButton.jsx` and `RuleBonusTimeButton.jsx`; unlabelled inputs in `AllDevicesCard.jsx` and `AddDeviceModal.jsx`; duplicate `id="bedrooms-input"` ×2 in each of the two bonus steppers (template leftover, with inert `data-input-counter-*` attrs) | **Board:** #26. Partly improved by the token sweep, but labels/aria are untouched. |
| 13 | Responsive bugs masked by `overflow-x: hidden` | ⬜ | `src/globals.css:3`, `Scheduler/Scheduler.jsx:48` (`m-8` in a half-width pane), `PolicyList.jsx:243` (`min-w-[160px]` search), `ModernDeviceCard.jsx` fixed `p-6` | **Board:** #27. |
| 14 | Polling where SSE already exists | ⬜ | `AdminConsole.jsx:122` has `EventSource('/pingmacaddresses')` (server `Routes/devices.js:118`); yet `Navbar.jsx:25` and `ActivityLog.jsx:21` poll every 30s | **Board:** #28. |

## Tier 3 — larger / strategic

| # | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| 15 | No per-device detail view | ⬜ | `ModernDeviceCard.jsx` "More" region is per-card local state | **Board:** #29. Proposed `/devices/:id`: state, resolved block mode, that device's activity log (the `ActivityLog` table supports filtering by `deviceMac`), schedules, rules, usage. |
| 16 | Three independent 1-second countdown timers | ⬜ | `PauseButton.jsx:67`, `BonusTimeButton.jsx`, `RuleBonusTimeButton.jsx:88`; plus a 5s `/getpausetimer` poll | **Board:** #30. Proposed: one shared timer context; derive from the expiry timestamp the server already returns. |
| 17 | Blocked Devices screen is read-only | ⬜ | `src/components/blocked_device/BlockedDevices.jsx` | **Board:** #31. No bulk unblock, no "allow for 30 min", no reason/why-blocked badge. |

---

## Dark mode: what was actually wrong

The first recon report claimed `darkMode: 'class'` in `tailwind.config.js:6` conflicted with the
`data-theme` mechanism and disabled every `dark:` utility. **That was wrong.** `src/App.jsx` also
set the `.dark` class, and the compiled CSS uses `:is(.dark .dark\:bg-base-200)`, so `dark:`
worked. Corrected diagnosis, and what was fixed:

| Problem | Fix |
|---|---|
| `index.html` hardcoded `data-theme="dark"` but never set the `.dark` class, so on first paint daisyUI rendered dark while every `dark:` utility was inert — `bg-white` cards flashed white on a dark page (and a light-theme install flashed dark). | `index.html` now pre-seeds `data-theme="light"` and runs a tiny inline ES5 script in `<head>` that applies the last known theme from `localStorage` before paint. |
| Theme was applied only after the `/getcurrenttheme` round-trip; nothing was cached. | `src/utility_functions/applyTheme.js` (`applyTheme`, `getCachedTheme`, `cacheTheme`) plus `cacheTheme` on every successful fetch. |
| Two mechanisms had to stay in sync and only one place did both. `useCurrentTheme.jsx` set only `data-theme` — a latent trap. | Logic centralised in `applyTheme.js`; dead `useCurrentTheme.jsx` deleted. |
| Hardcoded `bg-white` / `text-gray-*` / `dark:*gray*` bypassed daisyUI tokens, so the `cyberpunk` and `coffee` themes rendered wrong surfaces. | Swept to semantic tokens (`bg-base-100`, `text-base-content`, `border-base-300`) across 11 files. |

---

## Progress log

| Date | Item(s) | Outcome |
|---|---|---|
| 2026-11-24 | Recon | 17 items recorded in three tiers; 5 `scout` passes over shell, device UI, forms, theme/a11y, and data fetching. Three recon claims were rejected on verification (see below). |
| 2026-11-24 | 2, 3, 4, 5, 6 + Activity Log → navbar | Implemented and verified: `vite build` ✅, `eslint src/` 0 errors / 14 warnings (unchanged baseline), `server eslint` clean, `npm test` 43/43. Review gate initially FAILed on one missing `!res.ok` toast and one vestigial flex wrapper; both fixed, then re-reviewed clean. |
| 2026-11-24 | 1 | Reclassified: multi-page nav is ❌ by design (single pane of glass). Activity Log trigger moved to the navbar as requested. |
| 2026-11-24 | 2 (follow-up) | Reviewer caught two remaining `dark:shadow-gray-900` hardcoded shadows in the scheduler tables that the first sweep's grep pattern missed (it covered `bg`/`text`/`border` but not `shadow`). Replaced with `border-base-300 shadow-sm`. A broader audit (`dark:-(bg\|text\|border\|shadow\|ring\|divide)-<palette>-<shade>`) now returns zero matches. |
| 2026-11-24 | Dead routes | Deleted `/alldevices`, `/trafficrules`, `/seeallapps`, `/manageapp/:cat/:id` and their components (1,321 lines). Kept `/blockeddevices`. Moved `app_objects.js` to `traffic_rule_apps/`. Result: `vite build` ✅, lint **8 warnings** (was 14 — the deleted SeeAllApps accounted for 6), server eslint clean, 43/43 tests. |

## Rejected / corrected recon claims

| Claim | Reality |
|---|---|
| `src/components/traffic_rules/ModernDeviceCard.jsx` had hardcoded colors | That file does not exist. |
| `PolicyList.jsx:206` was the empty state | It is `PolicyList.jsx:320-323`; line 206 is the filter toggle. |
| `darkMode: 'class'` disabled all `dark:` utilities | False — `App.jsx` sets the `.dark` class. The real defect was the `index.html` pre-seed. |
| Live toggle failures use `alert()` | `alert()` existed only in the deleted `Devices.jsx`. |
| `grep` for hardcoded `dark:` utilities returned no matches | Too narrow: the pattern omitted `shadow`. Two `dark:shadow-gray-900` occurrences remained in the scheduler tables and were fixed in the follow-up pass. Use `dark:-(bg\|text\|border\|shadow\|ring\|divide)-<palette>-<shade>` when auditing. |

## Open questions

1. **Resolved 2026-11-24.** The `AllDevices`, `SeeAllApps`, `ManageApp`, and `TrafficRules` routes were
   confirmed unreachable and deleted (see "Dead route cleanup"). **`BlockedDevices` was deliberately
   kept** — see the capability note in that section.
2. `SeeAllApps.jsx:617` and `:633` both fetched `/getcurrentdevices` — moot now, the file is deleted.
3. `/getspecificdevice` in `Scheduler/Scheduler.jsx:28` looks unused: `ScheduleData` derives the
   device id from `useParams()`. Confirm before removing.
4. Mobile behaviour is unverified — the responsive items come from static analysis of class names,
   not from rendering on a device.

---

## Dead route cleanup (2026-11-24)

Only **three** navigation calls existed in the entire frontend (`Navbar.jsx` → `/`, `Login.jsx` → `/`,
`SeeAllApps.jsx` → `/trafficrules`). Nothing linked to the routes below, so they were URL-only.

| Route | Component | Size | Why it was safe to delete |
|---|---|---|---|
| `/alldevices` | `all_devices/AllDevices.jsx` | 231 lines | Fully duplicated: `AddDeviceModal` (opened from PolicyList) uses the same `useFetchAllDevices` hook and renders the same `AllDevicesCard` with the same search + filter. |
| `/trafficrules` | `traffic_rules/TrafficRules.jsx` | 145 lines | Duplicate wrapper around `RuleModals`, which `PolicyList` renders directly. |
| `/seeallapps` | `see_all_apps/SeeAllApps.jsx` | 921 lines | The app/category catalog is covered by `CreateRuleModal` (full `appSelection` + `categoryName` + `allAppsList` picker). Deleting it also removed 6 lint warnings. |
| `/manageapp/:cat/:id` | `manage_app_page/ManageApp.jsx` | 24 lines | Abandoned stub: static JSX, a two-option `<select>`, no fetch, no logic. |

**Retained on purpose:**

- `/blockeddevices` — `BlockedDevices.jsx`. Its endpoint (`/getallblockeddevices` → `getBlockedUsers()`)
  returns **every** client blocked in the controller, including clients NUA does not manage.
  `/getmacaddresses` only reconciles **managed** devices, so this is the only place to see a device
  blocked in UniFi directly. Owner decision: leave it until that gap is ported into the pane.
- Shared modules that lived in the deleted folders were kept and, in one case, moved:
  `AllDevicesCard.jsx` and `useFetchAllDevices.jsx` (used by `AddDeviceModal`),
  `useTrafficRules.js`, `RuleModals` + the rule modals, and `app_objects.js`, which was
  **moved** `see_all_apps/app_objects.js` → `traffic_rule_apps/app_objects.js` and its two importers
  (`CreateRuleModal.jsx`, `utility_functions/app_cat_utils.js`) updated.

Also cleaned: the four removed route entries and lazy imports in `main.jsx`, the corresponding
breadcrumb labels in `BreadCrumbs.jsx`, and a stale "same logic as SeeAllApps" comment in
`CreateRuleModal.jsx`.
