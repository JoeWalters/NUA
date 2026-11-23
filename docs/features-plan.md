# NUA Feature Plan

Research and progress tracking for new features. Created 2026-01-11.
Last updated: 2026-01-11.

## Current Feature Set (baseline — already shipped)

| Feature | Mechanism | Notes |
|---|---|---|
| Block/unblock devices | `blockClient` / `unblockClient` on UniFi | Per-device and per-group |
| Per-device speed limits | UniFi `qos-rules` (post-11.x re-map) | Download/upload caps, with schedules and bonus time |
| App category blocking | UniFi `firewall-policies` + DPI | Block/allow by category (e.g. "Social Media") |
| Individual app blocking | UniFi DPI app classification | Block/allow specific apps (e.g. "Twitch") |
| Scheduling (block/allow) | `node-schedule` + `Cron` / `EasySchedule` DB models | One-time and recurring |
| Bonus time | Temporary override with timer + `timeoutMap` | Auto-restores to block after timer |
| Device groups | `DeviceGroup` model + `/api/device-groups` | Bulk management, per-group schedules |

---

## Architectural Decision: Block Mode

### The problem with full device block

NUA's current block mechanism is `blockClient()` — a UniFi association-level block. The device can't connect to the Wi-Fi at all. This has a critical visibility problem for parental controls: **the parent can't see when the child turns the device on or attempts to connect.** No traffic stats, no online/offline events, no usage data. For a control app, not knowing when the thing you're controlling was *attempted* is a failure mode.

### Decision: three block modes per device/group

Block mode is a per-device or per-group setting that determines *how* a restriction is applied:

| Mode | Mechanism | Use Case |
|---|---|---|
| **Full Block** | `blockClient()` / `unblockClient()` | Bedtime — device should be off entirely |
| **Internet Block** | Firewall rule: LAN→WAN deny for the device's MAC | Daytime restrictions — "no internet, but the device is still on the LAN" |
| **Speed Limit** | `qos-rule` cap at 1–2 Kbps (download + upload) | Light restrictions — device is online but nothing works fast enough to use |

**Default recommendation:** Internet Block for most schedules. It keeps the device visible (you see it's online, you see when it turns on/off, you get usage data) while still making the internet unusable. Full Block remains for bedtime or when you genuinely want the device off.

**Why Internet Block over Speed Limit as the default:**
- Internet Block is *definitive* — zero internet access. Speed Limit at 1–2 Kbps is "effectively unusable" but not absolute (email, plain-text chat still work).
- Internet Block keeps LAN access, which is correct — the child's device should still reach local services (NAS, smart home).
- Internet Block is honest — the child understands "you're blocked from the internet" rather than confused about why their Wi-Fi "doesn't work."
- Both keep the device *visible*, which is the key insight from the user's observation.

### Impact on existing features

- **Bonus time** — `timeoutMap` logic stays the same; the *action* it fires changes based on block mode. Full Block → unblock. Internet Block → toggle off the firewall rule. Speed Limit → remove/restore the qos-rule.
- **Scheduling** — `jobFunction` currently only knows "block" and "allow." It needs a `mode` parameter so a schedule can fire "set to Internet Block" rather than "set to Full Block."
- **Activity Log** — becomes meaningful only with visible devices. "Device X set to Internet Block at 9 PM, bonus time at 7:30 PM, restored at 8:00 PM" is a useful log entry *because* the device was visible throughout.
- **Usage Dashboard** — only works for devices that are online. Internet Block and Speed Limit make this feature viable for restricted devices. Full Block does not.

### Default Block Behavior

The "default block mode" is the **resting state** of a device when it is restricted
without a schedule specifying otherwise. It answers: *when I restrict this device,
what kind of restriction is it?* It is configured at three levels, with a clear
hierarchy:

```
Global default (Settings)  →  fallback for everything
  └── Group default        →  overrides global for devices in that group
        └── Device default →  overrides group for that specific device
```

**Resolution order:** Device default > Group default > Global default.
If a device has no device-level default, it inherits from its group. If the
group has no group-level default, it falls back to global. A `null` value
means "use the parent level."

**Why three levels:**
- **Global** is configured once per household: "Most of the time, when I restrict
  a device, I mean Internet Block."
- **Group** handles the common case of "kids are different from teens." The
  "Kids" group defaults to Internet Block; a "Bedtime" group defaults to
  Full Block. Set once on the group, applies to all members.
- **Device** handles the outlier. One specific device — say the family TV —
  should be Internet Blocked even though it's in a group that defaults to
  Full Block.

**What the default controls:**

| Context | Uses the default? | Notes |
|---|---|---|
| Schedule fires "block" | Yes, unless the schedule specifies its own `targetMode` | A bedtime schedule can explicitly say "Full Block" even if the device default is "Internet Block" |
| Pause Internet Timer | Yes — always uses the default | "Pause" means "restrict me in the way I've configured this device to be restricted." |
| Bonus time expires | Yes — restores to the default | When bonus time ends, the device goes back to its default restricted state |
| Manual block from UI | Yes — uses the default | Clicking "Block" on a device card uses that device's default |
| Per-schedule override | Schedule can specify its own `targetMode` | This is how you get "Full Block at 10 PM but Internet Block during the day" on the same device |

**Schedule precedence (decided):** when a schedule fires and the device is
already in a different mode than the schedule's target, **the schedule wins** —
it switches to the target mode. A schedule is an explicit instruction and
should override the current state. This means a bedtime schedule that says
"Full Block" will switch a device from Internet Block to Full Block, even
if the device's default is Internet Block.

**UX:**

*Settings (global):*
```
Default Block Behavior:  [ Internet Block ▼ ]
  When a device is restricted without a specific mode, use this.
```

*Device settings (per-device):*
```
Default Block Mode:  [ Use group default ▼ ]   ← or explicitly: [ Full Block / Internet Block / Speed Limit ]
```

*Group settings (per-group):*
```
Default Block Mode:  [ Internet Block ▼ ]
  Applies to all devices in this group that don't have their own override.
```

*Pause button (per-device):*
```
[Pause]  →  quick menu:
  30 min
  1 hour
  Rest of today
  Custom...
  (uses this device's default block mode; optionally override with a mode selector)
```

**Implementation:**
- DB migration: add `defaultBlockMode` (nullable string) to `Device`,
  `DeviceGroup`, and `Credentials` (settings table).
- `jobFunction`: add a `mode` parameter; the scheduler looks up the resolved
  mode before firing.
- `timeoutMap` / bonus time: the "restore" action uses the resolved default mode.
- UI: three small dropdowns in existing settings/modals; no new screens.

---

### Open questions (resolved)

- [x] Does the device or the group own the block mode?
  **Resolved:** both, with hierarchy: Device > Group > Global.
- [x] Should "bonus time" lift to *the unrestricted state* or just *one step up*?
  **Resolved:** bonus time lifts to fully unrestricted (no block, normal speed).
- [x] When a schedule fires and the device is in a different mode, does it switch or stay?
  **Resolved:** the schedule wins — it switches to the target mode (option A).

---

## Architectural Decision: Managed Device vs. Blockable Device

### The problem

NUA's current mental model is: *a device in NUA = a device I can block.* To apply any
restriction to a device — speed limit, app block, schedule — the device must first
exist as a "blockable" entity in NUA's database. This forces a dependency that
doesn't actually exist: a device and its restrictions are treated as one thing
when they're two.

The "YouTube on the family TV" case illustrates this. The TV should be *managed*
by NUA — NUA knows about it, it shows on the dashboard, YouTube can be restricted
on it — but "block the TV" isn't a meaningful operation. The TV isn't a
"blocked device." It's a device with an app restriction. Forcing it through the
"add a blockable device" flow is a wrong abstraction.

### Decision: decouple managed device from blockable device

A device in NUA is **managed** — NUA tracks it, shows it on the dashboard, and
can apply restrictions to it. The restriction types are **independent management
types** that are enabled per device:

| Management Type | What it does | UI on device card |
|---|---|---|
| **Block / Unblock** | Full block, internet block, or speed limit (see Block Mode decision above) | Block/Pause buttons, bonus time |
| **Speed Limit** | Per-device bandwidth cap (already exists) | Speed limit controls |
| **App Restrictions** | App category or individual app block/allow | "YouTube: Blocked" badge |
| **Visibility only** | Device shows on the dashboard, no restrictions | Shows up, no controls |

Each device can have **any combination**, enabled or disabled at any time, in any
order. There is no prerequisite and no separate entity to create. The device is
the entity; management types are just flags on it. The UI shows or hides controls
based on which flags are set.

**Adding a device:** you add it once as a managed device, then enable or disable
any combination of management types. No ordering constraint.

```
[Add Device]
  Device name:  [Family TV]
  MAC address:  [d8:31:34:5f:01:12]
  Management types:
    [✓] Block / Unblock
    [ ] Speed Limit
    [✓] App Restrictions
    [ ] Visibility only
```

**Device card — app restrictions only:**
```
[Family TV]
  YouTube: Blocked  |  App Restrictions
  [Manage restrictions ▼]
  (no Block button — block management type not enabled)
```

**Device card — fully managed:**
```
[Sam's Phone]
  Internet Blocked  |  Speed Limit: 5 Mbps  |  Social Media: Blocked
  [Block] [Pause] [Bonus Time]
  [Manage restrictions ▼]
```

### Impact on existing features

- **Bonus time** — only applies to devices with Block/Unblock management type
  enabled. No logic change, just a guard.
- **Scheduling** — a schedule can target a device regardless of its management
  types. The schedule *is* the restriction.
- **Device groups** — groups can have a mix of management types. A "Kids" group
  could have Block + App Restrictions; a "TVs" group could have App Restrictions
  only.
- **Pause Internet Timer** — only works on devices with Block/Unblock management
  type. Makes sense — you can't "pause" a device that's only managed for app
  restrictions.
- **Activity Log** — logs all restriction changes regardless of type.

### Implementation

- **DB:** Add `managementTypes` (JSON array or separate boolean flags) to the
  `Device` model. E.g. `["block", "speedLimit", "appRestrictions"]`.
  Alternatively, derive it from which restrictions are attached — a device with
  a `TrafficRules` row for app blocking implicitly has the "App Restrictions"
  management type. The explicit flag approach is simpler and more flexible
  (allows "Visibility only" with no restrictions attached).
- **UI:** `PolicyList` / device cards conditionally render controls based on
  `managementTypes`. No new screens, just conditional rendering.
- **API:** No changes to restriction endpoints — they're already device-agnostic.
- **Adding a device:** the add-device flow gets a management-type selector.

---

## Feature Backlog

Status legend: `[ ]` not started, `[~]` in progress, `[x]` shipped.

### Tier 1 — High Value, Feasible Now

#### 1. Pause Internet Timer
**What:** 1-click "pause internet" on a device or group for 30 min / 1 hr / rest of today,
with automatic restore at the end of the timer.
**Mechanism:** Wrapper around existing block + bonus-time infrastructure. A "pause" is
a scheduled block with an auto-scheduled unblock. The `timeoutMap` already tracks
pending restores.
**Why it matters:** The single most requested UX in self-hosted parental controls
(Lantern Watch, TubeTimeout, Omada Profile Manager). NUA has the primitives but no
quick-pause UI.
**Effort:** Low — UI + a thin schedule helper on top of existing bonus-time code.
**Status:** [ ]
**Notes:**
- "Pause everyone" variant: block all "personal" devices, skip infrastructure.
- Needs a device-group "infrastructure" flag so pause-everyone doesn't hit the router, NAS, cameras, etc.
- "Rest of today" = unblock at 12:00 AM next day.

#### 2. Activity Log / Audit Trail
**What:** A queryable, viewable log of all block/unblock/schedule/bonus-time events
with timestamps, device, and reason.
**Mechanism:** `serverLogger` already writes to `./config/server_logs/`. Needs:
  - A structured log table in the DB (or a queryable log format).
  - A read-only API endpoint to fetch recent events.
  - A simple UI tab/section to view them.
**Why it matters:** Turns NUA from "I can block" into "I can see what happened."
Peace-of-mind + debugging.
**Effort:** Low-moderate.
**Status:** [ ]
**Notes:**
- Log entry shape: `{ timestamp, device, action, reason, scheduledBy }`
- Should survive restarts (DB-backed, not just in-memory).
- Consider a "recent events" sidebar on the main dashboard.

#### 3. Per-Device Usage Dashboard
**What:** Show per-device data used (today/this week), top apps by usage, and
time online. Read-only from UniFi's stats API.
**Mechanism:** UniFi exposes `getStations` and `getSiteStatistics`. NUA would
poll/aggregate and render.
**Why it matters:** NUA is a *control* app with no *visibility* layer. This is the
biggest strategic gap.
**Effort:** Medium. Pure read-only from UniFi stats APIs, new frontend view.
**Status:** [ ]
**Notes:**
- Start with today's throughput + time online. Weekly/historical is a stretch.
- UniFi's `getStations` returns `rx_bytes` / `tx_bytes` cumulative; need a
  snapshot baseline to compute deltas, or use the per-10-min stats API.

#### 4. Social Media Profile Presets
**What:** Pre-built rule sets: "Open" (all social media allowed), "Moderate" (blocked
after 8 PM), "Strict" (blocked entirely). One-click to apply to a device or group.
**Mechanism:** A set of `TrafficRules` + `EasySchedule` rows that get created when a
preset is applied. NUA already supports per-device traffic rules + schedules.
**Why it matters:** The most requested configuration in the self-hosted space.
Reduces setup friction dramatically.
**Effort:** Low-moderate.
**Status:** [ ]
**Notes:**
- Preset = a named collection of rules + schedules.
- Could also include "YouTube Restricted Mode" as a sub-toggle (DNS trick).
- Should be reversible: switching from Strict → Moderate removes the extra rules.

#### 5. Alerts / Notifications
**What:** Push notification (Discord webhook, email, or web push) when:
  - A new device joins the network
  - A schedule fires (block/unblock)
  - Bonus time is granted or expires
  - A device is manually blocked/unblocked
**Mechanism:** Hook into the existing `timeoutMap`, scheduler events, and the
device-list refresh. Fire a webhook or email.
**Why it matters:** Practical. "I don't have to be at the computer to know when
something happened."
**Effort:** Low-moderate.
**Status:** [ ]
**Notes:**
- Discord webhook is the easiest first implementation (just a POST to a URL).
- Web push requires a service worker + a push server (more complex, do later).
- Could start with just "bonus time granted / expired" notifications.

### Tier 2 — Medium Value, Medium Effort

#### 6. Per-App Usage Limits
**What:** "Allow 2 hours of YouTube/day, 1 hour of Twitch/day."
**Mechanism:** NUA would track per-app session start/end via DPI data and enforce
a daily cap by scheduling a block after the cap is hit.
**Effort:** High.
**Status:** [ ]
**Notes:**
- UniFi DPI classifies apps but doesn't provide per-session timing.
- Would need to poll UniFi's app stats and compute per-device per-app totals.
- Feasible but adds significant complexity (new DB table, a monitoring loop).

#### 7. Bedtime / "Hours of Peace" Preset
**What:** A pre-built schedule: block all kids' devices 9 PM → 7 AM, auto-restores.
**Mechanism:** A pre-built `EasySchedule` or `Cron` per group.
**Effort:** Very low (a preset, similar to #4).
**Status:** [ ]
**Notes:**
- Could be part of the Social Media Presets (#4) or standalone.
- "Wake time" = 7 AM unblock; "Bed time" = 9 PM block.

#### 8. "Pause Everyone" / Global Block
**What:** One tap to block all "personal" devices at once.
**Mechanism:** A device-group "infrastructure" flag + a bulk-action endpoint that
blocks all non-infrastructure devices in one call.
**Effort:** Low.
**Status:** [ ]
**Notes:**
- This is a sub-feature of #1 (Pause Internet Timer) and can be shipped together.

### Tier 3 — Stretch / Nicer-to-Have

#### 9. DNS-Level Content Filtering (Pi-hole / AdGuard / NextDNS)
**What:** Per-device DNS blocklist management.
**Effort:** High (requires external DNS service or managed DNS provider integration).
**Status:** [ ]

#### 10. Smart Device Auto-Naming
**What:** Auto-identify mystery devices by their DNS queries.
**Effort:** High.
**Status:** [ ]

#### 11. Weekly/Monthly Reports
**What:** Auto-generate a summary report per household.
**Effort:** High.
**Status:** [ ]

#### 12. Guest Network Isolation
**What:** Toggle guest network access per device.
**Effort:** Medium.
**Status:** [ ]

#### 13. Per-App Content Filtering (within an allowed app)
**What:** "Allow YouTube but block X-rated content."
**Effort:** High (requires DNS or proxy inspection beyond UniFi DPI).
**Status:** [ ]

---

## Status Log

| Date | Item | Notes |
|------|------|-------|
| 2026-01-11 | Plan created | Feature research completed; backlog organized into tiers. No features started yet. |
| 2026-01-11 | Block mode decision | Added three-mode block architecture (Full Block / Internet Block / Speed Limit) as a foundational design decision. Internet Block recommended as default for schedules. Ripples through bonus time, scheduling, activity log, and usage dashboard. Open questions captured. |
| 2026-01-11 | Default block behavior | Added three-level default hierarchy (Device > Group > Global) as the resting state for restricted devices. All three open questions resolved: both levels own block mode, bonus time lifts fully unrestricted, schedule target mode wins over current mode. |
| 2026-01-11 | Managed device decoupling | Added "Managed Device vs. Blockable Device" architectural decision. Devices are managed entities with independent management types (Block/Unblock, Speed Limit, App Restrictions, Visibility only). No prerequisite: add a device for any restriction type, enable/disable types at any time. No separate entity per type. |
| 2026-01-11 | Step 1: Block Mode — data model + UI | Added `blockMode` field to `Device` model (Prisma + migration `20260111000000_add_block_mode_to_device`, default `"full"`). Extended `PUT /updatedevicedata` to accept and validate `blockMode` ("full", "internet", "speedlimit"). Added block mode selector to edit device modal (`DeviceModals.jsx`). Added block mode badge to device card header and expanded details (`ModernDeviceCard.jsx`). No behavior change yet — wiring into scheduler is Step 2. |
| 2026-01-11 | Step 2: Block Mode — wire into scheduler | Added `server/server_util_funcs/blockMode.js` — `applyBlock`/`clearBlock` dispatch to the right mechanism based on mode (full: `blockClient`/`unblockClient`; internet: toggle firewall policy; speedlimit: toggle qos-rule at 2 Kbps). Updated `jobFunction` to look up device's `blockMode` from DB and dispatch. Updated `updatemacaddressstatus` (manual toggle), `stopBonusTimeViaToggleOff`, `cronBonusTimeEndJobReinitiation`, `easyBonusTimeEndJobReinitiation`, `bonusScheduler.startBonusTime`, and `schedules.js` `/deletebonustoggles` to use `applyBlock`/`clearBlock`. Group-level `blockMultiple`/`unblockMultiple` in `app.js` still use `blockClient`/`unblockClient` (full mode only — noted as a future improvement). All 43 tests pass; server lint clean; frontend build clean. |
| 2026-01-11 | Step 3: Pause Internet Timer | Added `pausedUntil DateTime?` to Device model (migration `20260111001000_add_paused_until_to_device`). Created `server/server_util_funcs/pauseTimer.js` — `pauseDevice`/`unpauseDevice`/`reArmPausedDevicesOnBoot` with presets (30min/1hr/3hrs/restOfToday/custom). Added `POST /pause-device`, `POST /unpause-device`, `GET /getpausetimer` endpoints to `devices.js`. Wired `reArmPausedDevicesOnBoot` into `app.js` boot sequence. Created `PauseButton.jsx` — dropdown with preset durations, countdown display, and unpause button. Added to `ModernDeviceCard.jsx` next to BonusTimeButton. All 43 tests pass; server lint clean; frontend build clean. |
| 2026-01-11 | Step 4: Default Block Behavior + Group-level block mode | Added three-level default hierarchy. Migration `20260111002000_add_default_block_mode`: `Device.blockMode` made nullable (null = inherit), `DeviceGroup.defaultBlockMode` and `Credentials.defaultBlockMode` added, existing "full" backfilled to null. Added `resolveBlockMode(prisma, device)` to `blockMode.js` — resolves Device > Group > Global > "full". Updated all block/unblock paths (`jobFunction`, `updatemacaddressstatus`, bonus time re-initiation, `bonusScheduler`, `device-groups.js` `executeGroupSchedule` + group block/unblock endpoints) to use `resolveBlockMode`. UI: "Inherit" option in device edit modal, "Default Block Mode" dropdown in group manager, "Block Mode Defaults" section in SiteSettings. Group create/update endpoints accept `defaultBlockMode`. All 43 tests pass; server lint clean; frontend build clean. |
