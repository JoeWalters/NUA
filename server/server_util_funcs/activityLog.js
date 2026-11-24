// activityLog.js — fire-and-forget audit trail for NUA events.
//
// logActivity() writes a row to the ActivityLog table. It is intentionally
// non-blocking: if the write fails, it logs to console but does not throw.
// This ensures that a logging failure never breaks the main operation.
//
// Event types:
//   "block"        — device was blocked (manual or scheduled)
//   "unblock"      — device was unblocked / cleared
//   "pause"        — device was paused (pause timer started)
//   "unpause"      — device was unpaused (pause timer expired or cancelled)
//   "bonus_start"  — bonus time was granted
//   "bonus_end"    — bonus time ended / was cancelled
//   "schedule_fire" — a scheduled job fired
//   "schedule_cancel" — a scheduled job was cancelled

/**
 * Log an activity event. Fire-and-forget: failures are logged to console
 * but do not throw.
 *
 * @param {object} prisma       the Prisma client
 * @param {string} eventType    one of the event types listed above
 * @param {object} opts
 * @param {string} [opts.deviceName]  device name (for display)
 * @param {string} [opts.deviceMac]   device MAC address
 * @param {string} [opts.blockMode]   "full" | "internet" | "speedlimit"
 * @param {string} [opts.detail]      additional context
 * @param {boolean} [opts.success]    whether the operation succeeded (default: true)
 */
async function logActivity(prisma, eventType, opts = {}) {
  try {
    await prisma.activityLog.create({
      data: {
        eventType,
        deviceName: opts.deviceName || null,
        deviceMac: opts.deviceMac || null,
        blockMode: opts.blockMode || null,
        detail: opts.detail || null,
        success: opts.success !== undefined ? opts.success : true,
      },
    });
  } catch (error) {
    console.error('activityLog: failed to write event:', eventType, error?.message || error);
  }
}

module.exports = { logActivity };
