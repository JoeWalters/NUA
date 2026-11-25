// Pure helpers that map the newest ActivityLog row for a device MAC to a
// "block reason" badge. No React, no fetch — only logic.
//
// Mapping (from the newest row only):
//   eventType 'block'  + detail 'manual_toggle'      -> Manual
//   eventType 'block'  + detail starts 'schedule_fire' -> Schedule
//   eventType 'pause'                                 -> Paused
//   no row / anything else (unblock, unpause, bonus_*, other) -> Unknown

export function getUnknownReason() {
  return { kind: 'unknown', label: 'Unknown', detail: null, timestamp: null };
}

export function getBlockedReason(log) {
  if (!log) return getUnknownReason();
  const { eventType, detail, timestamp } = log;
  if (eventType === 'block' && detail === 'manual_toggle') {
    return { kind: 'manual', label: 'Manual', detail, timestamp };
  }
  if (eventType === 'block' && typeof detail === 'string' && detail.startsWith('schedule_fire')) {
    return { kind: 'schedule', label: 'Schedule', detail, timestamp };
  }
  if (eventType === 'pause') {
    return { kind: 'paused', label: 'Paused', detail, timestamp };
  }
  return getUnknownReason();
}

// Reduce server logs (already ordered timestamp desc) to { macLower: reason }.
// First row per MAC wins (the newest). Rows without deviceMac are skipped.
export function reasonsByMac(logs) {
  const reasons = {};
  for (const log of logs || []) {
    if (!log?.deviceMac) continue;
    const key = log.deviceMac.toLowerCase();
    if (key in reasons) continue;
    reasons[key] = getBlockedReason(log);
  }
  return reasons;
}
