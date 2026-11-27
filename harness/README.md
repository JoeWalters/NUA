# UI harness

Renders the screens that only exist behind the Express/Prisma backend and a live
UniFi controller, using fixtures instead. It is what makes the screen-dependent
board cards (`#27`, `#36`, `#37`, `#38`, `#39`, `#40`) verifiable without a
controller: mount a scenario, drive it, measure it.

```bash
npm run harness                      # http://localhost:4391
```

```
http://localhost:4391/?scenario=devices            # device cards
http://localhost:4391/?scenario=policies           # policy list (devices + rules)
http://localhost:4391/?scenario=scheduler          # scheduler for device 1
http://localhost:4391/?scenario=console            # the full home screen
http://localhost:4391/?scenario=shell              # navbar + activity log
http://localhost:4391/?scenario=devices&w=375      # pinned to 375px for responsive checks
```

## What it is, and is not

- **It is** the real components, mounted with fixture props and a stubbed
  `fetch` (`stubFetch.js`) that answers the endpoints they call.
- **It is not** a re-implementation, a mock of the components, or a build
  target. `npm run build` does not include it.
- The stubbed calls are recorded in `window.__harness.calls`, so a check can
  assert traffic (e.g. "one `/getcurrentdevices` for all three rule modals")
  rather than trusting a screenshot.

## Adding a scenario

1. Add fixture data to `fixtures.js`.
2. Add a component tree to `scenarios.jsx` (real components only).
3. If the scenario calls an endpoint the stub does not know, add it to the
   `routes` map in `stubFetch.js` — an unmapped GET falls back to
   `{ success: true }`, which renders but hides the gap.

## Why not just run the app

`npm run dev` boots the SPA but every screen calls the API, which needs
`server/` with Prisma + a UniFi controller. The harness deliberately removes
both so a layout or accessibility fix can be checked in seconds.

## Verified scenarios

Each was loaded in Chromium with `npm run harness` running; all render the real
components with fixture data and **no** console errors:

| scenario | what renders |
|---|---|
| `?scenario=devices` | four `ModernDeviceCard`s (online/offline, blocked/allowed, paused with a live countdown, bonus time) plus the Pause and bonus-time controls |
| `?scenario=policies` | `PolicyList` — device cards, rule rows, the tag and import dialogs |
| `?scenario=scheduler` | `Scheduler` for device 1 — the EasySched form and the cron table (descriptions from card #25) |
| `?scenario=console` | the full `AdminConsole` home screen — 4 devices, rules, tags, all dialogs |
| `?scenario=shell` | `Navbar` + `ActivityLog`, and `?w=375` pins it to a phone width |

## Known gaps (found by building this)

- **`EZScheduleTable` crashes when it has rows.** `DisplayOneTimeOrRecurringSchedule`
  imports `convertDigitsToDOW` from `../../utility_functions/convertDigitsToDOTW`,
  and that module does not exist — the import is `undefined`, so any device with an
  EasySched (recurring/one-time) schedule throws on render. `fixtures.js` keeps
  `ezScheduleData` empty for that reason and exports `ezScheduleRow` to reproduce it.
- React warns about missing `key` props in both schedule tables and about `checked`
  without `onChange` on their toggle inputs (pre-existing, not harness-related).
