/**
 * Traffic Rule Scheduler Module
 *
 * Lets traffic rules follow schedules (like device EasySchedules). A rule is
 * either enabled or disabled, so a schedule's action maps to:
 *   - "allow" -> enable the rule
 *   - "block" -> disable the rule
 *
 * A rule can hold MANY schedules, stored as rows in the TrafficRuleSchedule
 * table (mirroring how a device holds many EasySchedule rows). Provides:
 *   - addTrafficRuleSchedule:     create a one-time or recurring schedule
 *   - toggleTrafficRuleSchedule:  enable/disable a specific schedule
 *   - deleteTrafficRuleSchedule:  remove a specific schedule
 *   - reArmTrafficRuleSchedulesOnBoot: restore jobs after container restart
 */

const schedule = require('node-schedule');
const { convertToMilitaryTime } = require('../server_util_funcs/convert_to_military_time');
const { dateFromDateString } = require('../server_util_funcs/ez_sched_utils/dateFromDateString');
const { convertDOWtoString } = require('../server_util_funcs/ez_sched_utils/convertDOWtoString');
const { startTimeout, endTimeout, timeoutMap } = require('../server_util_funcs/start_&_clear_timeouts/start_end_timeouts');

/**
 * Fetch the live rule object from UniFi by its `_id` so that enabling/disabling
 * sends the actual UniFi shape (not the Prisma DB object, which UniFi rejects).
 */
async function fetchUnifiRule(unifi, unifiId) {
  const path = '/v2/api/site/default/trafficrules';
  const rules = await unifi.customApiRequest(path, 'GET');
  return (rules || []).find(rule => rule._id === unifiId) || null;
}

/**
 * Set the enabled state of a traffic rule in UniFi + DB.
 */
async function setRuleEnabled(unifi, prisma, ruleId, enabled) {
  const rule = await prisma.trafficRules.findUnique({ where: { id: ruleId } });
  if (!rule) {
    return;
  }

  if (unifi) {
    const unifiPath = `/v2/api/site/default/trafficrules/${rule.unifiId}`;
    const ruleCopy = await fetchUnifiRule(unifi, rule.unifiId);
    if (ruleCopy) {
      ruleCopy.enabled = enabled;
      await unifi.customApiRequest(unifiPath, 'PUT', ruleCopy);
    }
  }

  await prisma.trafficRules.update({
    where: { id: ruleId },
    data: { enabled }
  });
}

/**
 * The scheduled action: "allow" enables the rule, "block" disables it.
 *
 * One-time schedules clear themselves after firing (the job + persisted row are
 * removed), so a one-time action doesn't repeat.
 */
async function runTrafficRuleScheduleAction(action, unifi, prisma, scheduleId) {
  const row = await prisma.trafficRuleSchedule.findUnique({ where: { id: scheduleId } });
  if (!row) {
    return;
  }

  const enabled = action === 'allow';
  await setRuleEnabled(unifi, prisma, row.trafficRulesId, enabled);
  console.log(`[TrafficRuleSchedule] rule ${row.trafficRulesId} ${enabled ? 'enabled' : 'disabled'} by schedule`);

  if (row.scheduleType === 'oneTime') {
    await deleteTrafficRuleSchedule(scheduleId, unifi, prisma);
    console.log(`[TrafficRuleSchedule] rule ${row.trafficRulesId} one-time schedule completed; cleared`);
  }
}

/**
 * Create a one-time schedule job for a schedule row.
 * @returns {Object|null} the node-schedule job object
 */
async function addOneTimeTrafficRuleSchedule(scheduleId, data, unifi, prisma) {
  const { date, hour, minute, ampm, scheduleAction } = data;
  const { year, month, day } = dateFromDateString(date);
  const modifiedHour = convertToMilitaryTime(ampm, parseInt(hour));
  const dateTime = new Date(year, month - 1, day, modifiedHour, parseInt(minute), 0);

  return schedule.scheduleJob(dateTime, () =>
    runTrafficRuleScheduleAction(scheduleAction, unifi, prisma, scheduleId)
  );
}

/**
 * Create a recurring schedule job for a schedule row.
 * @returns {Object|null} the node-schedule job object
 */
async function addRecurringTrafficRuleSchedule(scheduleId, data, unifi, prisma) {
  const { hour, minute, ampm, modifiedDaysOfTheWeek, scheduleAction } = data;
  const modifiedHour = convertToMilitaryTime(ampm, parseInt(hour));
  const rule = new schedule.RecurrenceRule();
  rule.dayOfWeek = [...modifiedDaysOfTheWeek];
  rule.hour = modifiedHour;
  rule.minute = parseInt(minute);

  return schedule.scheduleJob(rule, () =>
    runTrafficRuleScheduleAction(scheduleAction, unifi, prisma, scheduleId)
  );
}

/**
 * Create a schedule for a traffic rule and persist it as a new row.
 */
async function addTrafficRuleSchedule(ruleId, data, unifi, prisma) {
  const { date, hour, minute, ampm, oneTime, modifiedDaysOfTheWeek, scheduleAction } = data;
  const rule = await prisma.trafficRules.findUnique({ where: { id: ruleId } });
  if (!rule) {
    throw new Error(`Traffic rule ${ruleId} not found`);
  }

  const scheduleDays = oneTime
    ? null
    : convertDOWtoString(modifiedDaysOfTheWeek.join(''));

  // Insert the row first so we have its id for the job callback.
  const created = await prisma.trafficRuleSchedule.create({
    data: {
      trafficRulesId: ruleId,
      scheduleType: oneTime ? 'oneTime' : 'recurring',
      scheduleDate: oneTime ? date : null,
      scheduleHour: convertToMilitaryTime(ampm, parseInt(hour)),
      scheduleMinute: parseInt(minute),
      scheduleDays,
      scheduleAction,
      scheduleEnabled: true,
    }
  });

  let job;
  if (oneTime) {
    job = await addOneTimeTrafficRuleSchedule(created.id, data, unifi, prisma);
  } else {
    job = await addRecurringTrafficRuleSchedule(created.id, data, unifi, prisma);
  }

  if (!job) {
    await prisma.trafficRuleSchedule.delete({ where: { id: created.id } });
    throw new Error('Failed to create traffic rule schedule job');
  }

  const updated = await prisma.trafficRuleSchedule.update({
    where: { id: created.id },
    data: { scheduleJobName: job.name }
  });

  return { job, schedule: updated };
}

/**
 * Toggle an existing schedule on/off for a traffic rule (by schedule id).
 */
async function toggleTrafficRuleSchedule(scheduleId, unifi, prisma, toggleOn) {
  const row = await prisma.trafficRuleSchedule.findUnique({ where: { id: scheduleId } });
  if (!row || !row.scheduleJobName) {
    throw new Error('No schedule exists for this traffic rule');
  }

  if (!toggleOn) {
    const job = schedule.scheduledJobs[row.scheduleJobName];
    job?.cancel();
    await prisma.trafficRuleSchedule.update({
      where: { id: scheduleId },
      data: { scheduleEnabled: false }
    });
    return false;
  }

  // Re-create the job from the persisted schedule data
  let job;
  if (row.scheduleType === 'oneTime') {
    const { year, month, day } = dateFromDateString(row.scheduleDate);
    const dateTime = new Date(year, month - 1, day, row.scheduleHour, row.scheduleMinute, 0);
    job = schedule.scheduleJob(dateTime, () =>
      runTrafficRuleScheduleAction(row.scheduleAction, unifi, prisma, scheduleId)
    );
  } else {
    const modifiedDays = row.scheduleDays.split('').map(day => parseInt(day));
    const r = new schedule.RecurrenceRule();
    r.dayOfWeek = [...modifiedDays];
    r.hour = row.scheduleHour;
    r.minute = row.scheduleMinute;
    job = schedule.scheduleJob(r, () =>
      runTrafficRuleScheduleAction(row.scheduleAction, unifi, prisma, scheduleId)
    );
  }

  await prisma.trafficRuleSchedule.update({
    where: { id: scheduleId },
    data: { scheduleEnabled: true, scheduleJobName: job.name }
  });

  return job;
}

/**
 * Delete a schedule for a traffic rule (cancels the job, removes the row).
 */
async function deleteTrafficRuleSchedule(scheduleId, unifi, prisma) {
  const row = await prisma.trafficRuleSchedule.findUnique({ where: { id: scheduleId } });
  if (!row) {
    return;
  }

  if (row.scheduleJobName) {
    const job = schedule.scheduledJobs[row.scheduleJobName];
    job?.cancel();
  }

  await prisma.trafficRuleSchedule.delete({ where: { id: scheduleId } });
}

/**
 * Boot-time restore. Re-creates in-memory jobs for schedule rows that are
 * enabled. Returns count for logging.
 */
async function reArmTrafficRuleSchedulesOnBoot(unifi, prisma) {
  let rearmed = 0;

  const rows = await prisma.trafficRuleSchedule.findMany({
    where: { scheduleEnabled: true }
  });

  for (const row of rows) {
    if (!row.scheduleType) {
      continue;
    }

    let job;
    if (row.scheduleType === 'oneTime') {
      const { year, month, day } = dateFromDateString(row.scheduleDate);
      const dateTime = new Date(year, month - 1, day, row.scheduleHour, row.scheduleMinute, 0);
      job = schedule.scheduleJob(dateTime, () =>
        runTrafficRuleScheduleAction(row.scheduleAction, unifi, prisma, row.id)
      );
    } else {
      const modifiedDays = row.scheduleDays.split('').map(day => parseInt(day));
      const r = new schedule.RecurrenceRule();
      r.dayOfWeek = [...modifiedDays];
      r.hour = row.scheduleHour;
      r.minute = row.scheduleMinute;
      job = schedule.scheduleJob(r, () =>
        runTrafficRuleScheduleAction(row.scheduleAction, unifi, prisma, row.id)
      );
    }

    if (job) {
      await prisma.trafficRuleSchedule.update({
        where: { id: row.id },
        data: { scheduleJobName: job.name }
      });
      rearmed++;
    }
  }

  return { rearmed };
}

module.exports = {
  addTrafficRuleSchedule,
  toggleTrafficRuleSchedule,
  deleteTrafficRuleSchedule,
  reArmTrafficRuleSchedulesOnBoot
};
