/**
 * Device Scheduler Module
 *
 * Re-arms device cron/easy schedules at boot (like bonus timers and traffic
 * rule schedules). Cron and EasySchedule jobs only re-initiate when the
 * frontend calls /checkjobreinitiation; this restores them server-side so a
 * container restart doesn't silently drop scheduled block/unblock actions.
 *
 * Provides:
 *   - reArmDeviceSchedulesOnBoot: restore cron + easy schedule jobs after restart
 */

const schedule = require('node-schedule');
const { dateFromDateString } = require('../server_util_funcs/ez_sched_utils/dateFromDateString');

/**
 * Create a node-schedule job whose callback is wrapped so a rejection is logged
 * instead of being emitted as an unhandled 'error' event (which crashes the
 * whole process). An 'error' listener is attached as a belt-and-suspenders.
 */
function scheduleSafeJob(trigger, callback) {
  let job;
  try {
    job = schedule.scheduleJob(trigger, async () => {
      try {
        await callback();
      } catch (error) {
        console.error('[DeviceSchedule] Job callback failed:', error);
      }
    });
  } catch (error) {
    console.error('[DeviceSchedule] Failed to create job:', error);
    return null;
  }
  if (job) {
    job.on('error', (error) => {
      console.error('[DeviceSchedule] Job emitted error:', error);
    });
  }
  return job;
}

/**
 * Boot-time restore for device cron + easy schedules. Re-creates in-memory
 * jobs for enabled rows, passing the live `unifi`/`prisma` into jobFunction so
 * the re-armed job actually blocks/unblocks when it fires (the frontend-triggered
 * /checkjobreinitiation path omits these args — a latent bug). One-time
 * schedules whose trigger already elapsed while the container was down are
 * cleaned up instead of firing immediately.
 *
 * @returns {Promise<{rearmed: number, cleaned: number}>} counts for logging
 */
async function reArmDeviceSchedulesOnBoot(unifi, prisma, jobFunction) {
  let rearmed = 0;
  let cleaned = 0;

  const devices = await prisma.device.findMany();
  const macByDeviceId = new Map(devices.map((d) => [d.id, d.macAddress]));

  // Re-arm cron schedules
  const cronRows = await prisma.cron.findMany({ where: { toggleCron: true } });
  for (const row of cronRows) {
    const macAddress = macByDeviceId.get(row.deviceId);
    if (!macAddress || !row.crontime) {
      continue;
    }
    const job = scheduleSafeJob(row.crontime, () =>
      jobFunction(row.crontype, macAddress, false, unifi, prisma)
    );
    if (job) {
      await prisma.cron.update({
        where: { id: row.id },
        data: { jobName: job.name }
      });
      rearmed++;
    }
  }

  // Re-arm easy schedules
  const easyRows = await prisma.easySchedule.findMany({ where: { toggleSched: true } });
  for (const row of easyRows) {
    const macAddress = macByDeviceId.get(row.deviceId);
    if (!macAddress) {
      continue;
    }

    let job;
    if (row.oneTime) {
      if (!row.date) {
        continue;
      }
      const { year, month, day } = dateFromDateString(row.date);
      const trigger = new Date(year, month - 1, day, row.hour, row.minute, 0);
      if (trigger < new Date()) {
        // One-time schedule already elapsed while down — clean it up
        await prisma.easySchedule.delete({ where: { id: row.id } });
        cleaned++;
        continue;
      }
      job = scheduleSafeJob(trigger, () =>
        jobFunction(row.blockAllow, macAddress, true, unifi, prisma)
      );
    } else {
      const modifiedDays = row.days ? row.days.split('').map((day) => parseInt(day)) : [];
      const rule = new schedule.RecurrenceRule();
      rule.dayOfWeek = [...modifiedDays];
      rule.hour = row.hour;
      rule.minute = row.minute;
      job = scheduleSafeJob(rule, () =>
        jobFunction(row.blockAllow, macAddress, false, unifi, prisma)
      );
    }

    if (job) {
      await prisma.easySchedule.update({
        where: { id: row.id },
        data: { jobName: job.name }
      });
      rearmed++;
    }
  }

  return { rearmed, cleaned };
}

module.exports = { reArmDeviceSchedulesOnBoot };
