const { test } = require('node:test');
const assert = require('node:assert');

const schedule = require('node-schedule');
const { timeoutMap } = require('../server_util_funcs/start_&_clear_timeouts/start_end_timeouts');

const service = require('../scheduler/service');
const { reArmDeviceSchedulesOnBoot } = require('../scheduler/deviceScheduler');
const { reArmTrafficRuleSchedulesOnBoot } = require('../scheduler/trafficRuleScheduler');
const { reArmTrafficBonusOnBoot } = require('../scheduler/trafficBonusScheduler');
const { reArmDeviceBonusOnBoot } = require('../scheduler/bonusScheduler');

// The tests create real node-schedule jobs and bonus-time timers. Cancel/clear
// them after the tests finish so the process can exit instead of hanging.
test.after(() => {
  for (const name in schedule.scheduledJobs) {
    schedule.scheduledJobs[name].cancel();
  }
  for (const [, entry] of timeoutMap) {
    clearTimeout(entry.timeoutId);
  }
  timeoutMap.clear();
});

// ---------------------------------------------------------------------------
// Scheduler service helpers
// ---------------------------------------------------------------------------

test('service: buildOneTimeDate builds a Date from string inputs', () => {
  const date = service.buildOneTimeDate({ date: '2026-01-15', hour: '2', minute: '30', ampm: 'PM' });
  assert.ok(date instanceof Date);
  assert.strictEqual(date.getFullYear(), 2026);
  assert.strictEqual(date.getMonth(), 0);
  assert.strictEqual(date.getDate(), 15);
  assert.strictEqual(date.getHours(), 14);
  assert.strictEqual(date.getMinutes(), 30);
});

test('service: buildRecurringRule builds a RecurrenceRule', () => {
  const rule = service.buildRecurringRule({ modifiedDaysOfTheWeek: [1, 2, 3], hour: 9, minute: 0 });
  assert.deepStrictEqual(rule.dayOfWeek, [1, 2, 3]);
  assert.strictEqual(rule.hour, 9);
  assert.strictEqual(rule.minute, 0);
});

test('service: jobExists / cancelJobByName', () => {
  assert.strictEqual(service.jobExists('definitely-not-a-job'), false);
  const job = service.createCronJob('0 0 * * *', () => {});
  assert.ok(job && job.name);
  assert.strictEqual(service.jobExists(job.name), true);
  assert.strictEqual(service.cancelJobByName(job.name), true);
  assert.strictEqual(service.jobExists(job.name), false);
});

test('service: reinitCronJob schedules a cron job', () => {
  const job = service.reinitCronJob({ crontime: '0 0 * * *', crontype: 'block' }, 'AA:BB:CC:DD:EE:FF', () => {});
  assert.ok(job && job.name);
  assert.strictEqual(service.jobExists(job.name), true);
  job?.cancel();
});

test('service: reinitOneTimeSchedule skips past dates', () => {
  const job = service.reinitOneTimeSchedule({ date: '2020-01-01', hour: '1', minute: '0', blockAllow: 'block' }, 'AA:BB:CC:DD:EE:FF', () => {});
  assert.strictEqual(job, null);
});

test('service: reinitOneTimeSchedule schedules a future date', () => {
  const job = service.reinitOneTimeSchedule({ date: '2099-01-01', hour: '1', minute: '0', blockAllow: 'block' }, 'AA:BB:CC:DD:EE:FF', () => {});
  assert.ok(job && job.name);
  job?.cancel();
});

test('service: reinitRecurringSchedule schedules a recurring job', () => {
  const job = service.reinitRecurringSchedule({ days: '0123456', hour: 9, minute: 0, blockAllow: 'block' }, 'AA:BB:CC:DD:EE:FF', () => {});
  assert.ok(job && job.name);
  job?.cancel();
});

// ---------------------------------------------------------------------------
// Boot-time re-arm functions (mocked Prisma)
// ---------------------------------------------------------------------------

test('deviceScheduler: reArmDeviceSchedulesOnBoot re-arms cron + easy schedules', async () => {
  const devices = [{ id: 1, macAddress: 'AA:BB:CC:DD:EE:FF' }];
  const cronRows = [{ id: 10, deviceId: 1, crontime: '0 12 * * *', crontype: 'block' }];
  const easyRows = [{ id: 20, deviceId: 1, days: '0123456', hour: 9, minute: 0, blockAllow: 'allow', oneTime: false }];
  const prisma = {
    device: { findMany: async () => devices },
    cron: { findMany: async () => cronRows, update: async () => ({}) },
    easySchedule: { findMany: async () => easyRows, update: async () => ({}) },
  };
  const result = await reArmDeviceSchedulesOnBoot(null, prisma, async () => {});
  assert.strictEqual(result.rearmed, 2);
  assert.strictEqual(result.cleaned, 0);
  schedule.gracefulShutdown();
});

test('deviceScheduler: cleans up elapsed one-time schedules', async () => {
  const devices = [{ id: 1, macAddress: 'AA:BB:CC:DD:EE:FF' }];
  const easyRows = [{ id: 21, deviceId: 1, date: '2020-01-01', hour: 1, minute: 0, blockAllow: 'block', oneTime: true }];
  const prisma = {
    device: { findMany: async () => devices },
    cron: { findMany: async () => [] },
    easySchedule: { findMany: async () => easyRows, delete: async () => ({}) },
  };
  const result = await reArmDeviceSchedulesOnBoot(null, prisma, async () => {});
  assert.strictEqual(result.cleaned, 1);
  assert.strictEqual(result.rearmed, 0);
});

test('trafficRuleScheduler: reArmTrafficRuleSchedulesOnBoot re-arms enabled schedules', async () => {
  const rows = [{ id: 1, scheduleType: 'recurring', scheduleDays: '0123456', scheduleHour: 9, scheduleMinute: 0, scheduleAction: 'allow' }];
  const prisma = {
    trafficRuleSchedule: { findMany: async () => rows, update: async () => ({}) },
  };
  const result = await reArmTrafficRuleSchedulesOnBoot(async () => {}, prisma);
  assert.strictEqual(result.rearmed, 1);
  schedule.gracefulShutdown();
});

test('trafficBonusScheduler: reArmTrafficBonusOnBoot handles future + expired', async () => {
  // Short expiry so the timer self-clears quickly and doesn't keep the process
  // alive; the callback is a no-op against the mocked Prisma.
  const future = { id: 1, unifiId: 'abc', bonusTimeExpiresAt: new Date(Date.now() + 50).toISOString() };
  const expired = { id: 2, unifiId: 'def', bonusTimeExpiresAt: new Date(Date.now() - 60000).toISOString() };
  const prisma = {
    trafficRules: {
      findMany: async () => [future, expired],
      findUnique: async ({ where }) => ({ id: where.id, unifiId: where.id === 1 ? 'abc' : 'def', enabled: true }),
      update: async () => ({}) },
  };
  const result = await reArmTrafficBonusOnBoot(async () => {}, prisma);
  assert.strictEqual(result.rearmed, 1);
  assert.strictEqual(result.expired, 1);
});

test('bonusScheduler: reArmDeviceBonusOnBoot handles future + expired', async () => {
  // Use distinct ids so the timer keys do not collide with the traffic-bonus
  // test (both use startTimeoutFromExpiry keyed by the rule/device id), and a
  // short expiry so the timer self-clears quickly.
  const future = { id: 3, bonusTimeExpiresAt: new Date(Date.now() + 50).toISOString() };
  const expired = { id: 4, bonusTimeExpiresAt: new Date(Date.now() - 60000).toISOString() };
  const prisma = {
    device: {
      findMany: async () => [future, expired],
      findUnique: async ({ where }) => ({ id: where.id, macAddress: 'AA:BB:CC:DD:EE:FF' }),
      update: async () => ({}) },
    cronBonusToggles: { findMany: async () => [] },
    easyBonusToggles: { findMany: async () => [] },
  };
  const result = await reArmDeviceBonusOnBoot(null, prisma, async () => {}, null);
  assert.strictEqual(result.rearmed, 1);
  assert.strictEqual(result.expired, 1);
});
