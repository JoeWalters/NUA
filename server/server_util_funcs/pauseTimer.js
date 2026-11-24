// pauseTimer.js — Pause Internet Timer logic.
//
// A "pause" temporarily blocks a device using its configured blockMode and
// auto-restores it after a duration. The timer uses the same timeoutMap
// infrastructure as bonus time (device ID as the timer key), so a device
// can't have a pause and a bonus timer simultaneously.
//
// Presets: "30min", "1hr", "3hrs", "restOfToday", or { hours, minutes } for custom.
//
// Restart-safe: pausedUntil is persisted on the Device row so a timer that
// survived a restart can be re-armed by reArmPausedDevicesOnBoot().

const { applyBlock, clearBlock, resolveBlockMode } = require('./blockMode');
const { logActivity } = require('./activityLog');
const { startTimeout, endTimeout, startTimeoutFromExpiry, timeoutMap } = require('./start_&_clear_timeouts/start_end_timeouts');

// Resolve a preset string to { hours, minutes }.
// "restOfToday" is resolved to hours/minutes until midnight.
function resolvePreset(preset) {
  if (typeof preset === 'object' && preset !== null) {
    return { hours: preset.hours || 0, minutes: preset.minutes || 0 };
  }
  switch (preset) {
  case '30min':  return { hours: 0, minutes: 30 };
  case '1hr':    return { hours: 1, minutes: 0 };
  case '3hrs':   return { hours: 3, minutes: 0 };
  case 'restOfToday': {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diffMs = midnight - now;
    const totalMinutes = Math.ceil(diffMs / 60000);
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  }
  default:
    return { hours: 0, minutes: 30 }; // safe fallback
  }
}

/**
 * Pause a device: block it using its blockMode and set a timer to restore it.
 * @param {number} deviceId    the device's DB id
 * @param {string|object} preset  a preset name or { hours, minutes }
 * @param {object} unifi       the node-unifi client
 * @param {object} prisma      the Prisma client
 * @returns {Promise<{ timer: number, pausedUntil: string }>}
 */
async function pauseDevice(deviceId, preset, unifi, prisma) {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { deviceGroup: true } });
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  // If a timer is already running for this device (bonus time), cancel it first.
  if (timeoutMap.has(deviceId)) {
    endTimeout(deviceId);
  }

  const { hours, minutes } = resolvePreset(preset);
  const totalMinutes = hours * 60 + minutes;

  // Block the device using its resolved block mode.
  const resolvedMode = await resolveBlockMode(prisma, device);
  const success = await applyBlock(device.macAddress, resolvedMode, unifi, prisma);
  if (!success) {
    throw new Error(`Failed to block device ${device.macAddress}`);
  }

  // Persist the paused state.
  const pausedUntil = new Date(Date.now() + totalMinutes * 60000);
  await prisma.device.update({
    where: { id: deviceId },
    data: { active: false, pausedUntil: pausedUntil.toISOString() },
  });

  logActivity(prisma, 'pause', {
    deviceName: device.name,
    deviceMac: device.macAddress,
    blockMode: resolvedMode,
    detail: typeof preset === 'string' ? preset : `custom (${totalMinutes}min)`,
  });

  // Set up the auto-restore timer.
  const restoreCallback = async () => {
    await unpauseDevice(deviceId, unifi, prisma);
  };

  startTimeout(deviceId, minutes, hours, restoreCallback);

  const expiry = timeoutMap.get(deviceId)?.time;
  const timerMs = expiry ? expiry - Date.now() : totalMinutes * 60000;

  return { timer: timerMs, pausedUntil: pausedUntil.toISOString() };
}

/**
 * Unpause a device: cancel the timer and clear the block.
 * @param {number} deviceId
 * @param {object} unifi
 * @param {object} prisma
 * @returns {Promise<boolean>} true if the device was unpaused
 */
async function unpauseDevice(deviceId, unifi, prisma) {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { deviceGroup: true } });
  if (!device) {
    return false;
  }

  // Cancel any running timer.
  endTimeout(deviceId);

  // Clear the block using the device's resolved block mode.
  const resolvedMode = await resolveBlockMode(prisma, device);
  await clearBlock(device.macAddress, resolvedMode, unifi, prisma);

  // Persist the unpaused state.
  await prisma.device.update({
    where: { id: deviceId },
    data: { active: true, pausedUntil: null },
  });

  logActivity(prisma, 'unpause', {
    deviceName: device.name,
    deviceMac: device.macAddress,
    blockMode: resolvedMode,
    detail: 'timer_expired',
  });

  return true;
}

/**
 * Boot-time restore for paused devices. Re-arms timers for devices whose
 * pausedUntil is still in the future; immediately unpauses devices whose
 * expiry already passed while the container was down.
 * @param {object} unifi
 * @param {object} prisma
 * @returns {Promise<{ rearmed: number, expired: number }>}
 */
async function reArmPausedDevicesOnBoot(unifi, prisma) {
  let rearmed = 0;
  let expired = 0;

  const pausedDevices = await prisma.device.findMany({
    where: { pausedUntil: { not: null } },
  });

  for (const device of pausedDevices) {
    const expiry = new Date(device.pausedUntil).getTime();
    const remaining = expiry - Date.now();

    if (remaining > 0) {
      // Still paused — re-arm the timer.
      startTimeoutFromExpiry(device.id, expiry, async () => {
        await unpauseDevice(device.id, unifi, prisma);
        endTimeout(device.id);
      });
      rearmed++;
    } else {
      // Paused time already elapsed — unpause now.
      await unpauseDevice(device.id, unifi, prisma);
      expired++;
    }
  }

  return { rearmed, expired };
}

module.exports = {
  pauseDevice,
  unpauseDevice,
  reArmPausedDevicesOnBoot,
  resolvePreset,
};
