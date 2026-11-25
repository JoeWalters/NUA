const { test } = require('node:test');
const assert = require('node:assert');

const schedule = require('node-schedule');
const { timeoutMap } = require('../server_util_funcs/start_&_clear_timeouts/start_end_timeouts');

const { startBonusTime, restartPausedJobs, reArmDeviceBonusOnBoot } = require('../scheduler/bonusScheduler');

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

const MAC = 'AA:BB:CC:DD:EE:FF';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// Fake node-unifi client: records calls and lets blockClient return a chosen
// result so we can simulate a failed re-block.
function makeUnifi({ blockResult = true } = {}) {
  const blockCalls = [];
  const unblockCalls = [];
  return {
    blockClient: async (mac) => {
      blockCalls.push(mac);
      return blockResult;
    },
    unblockClient: async (mac) => {
      unblockCalls.push(mac);
      return true;
    },
    customApiRequest: async () => [],
    _blockCalls: blockCalls,
    _unblockCalls: unblockCalls,
  };
}

// Fake Prisma for startBonusTime. Records device updates and activity rows.
function makePrismaForStart({ active }) {
  const deviceUpdates = [];
  const activityRows = [];
  const prisma = {
    device: {
      update: async ({ where, data }) => {
        deviceUpdates.push({ where, data });
        return {};
      },
      findUnique: async ({ where }) => {
        return { id: where.id, name: 'Test Device', macAddress: MAC, active, blockMode: null, deviceGroup: null };
      },
    },
    easySchedule: { findMany: async () => [] },
    cron: { findMany: async () => [] },
    activityLog: {
      create: async ({ data }) => {
        activityRows.push(data);
        return {};
      },
    },
    credentials: { findUnique: async () => ({ defaultBlockMode: null }) },
  };
  return { prisma, deviceUpdates, activityRows };
}

// Fake Prisma for restartPausedJobs / reArmDeviceBonusOnBoot.
function makePrismaForRestart({ blockBeforeBonus }) {
  const deviceUpdates = [];
  const activityRows = [];
  const prisma = {
    cronBonusToggles: { findMany: async () => [] },
    easyBonusToggles: { findMany: async () => [] },
    device: {
      update: async ({ where, data }) => {
        deviceUpdates.push({ where, data });
        return {};
      },
      findUnique: async ({ where }) => {
        return { id: where.id, name: 'Test Device', macAddress: MAC, blockBeforeBonus, blockMode: null, deviceGroup: null };
      },
    },
    activityLog: {
      create: async ({ data }) => {
        activityRows.push(data);
        return {};
      },
    },
    credentials: { findUnique: async () => ({ defaultBlockMode: null }) },
  };
  return { prisma, deviceUpdates, activityRows };
}

// ---------------------------------------------------------------------------
// startBonusTime
// ---------------------------------------------------------------------------

test('bonusScheduler: startBonusTime resolves and logs bonus_start with the MAC (T0)', async () => {
  // Allowed device: must resolve without throwing.
  const allowed = makePrismaForStart({ active: true });
  await startBonusTime(1, 0, 30, makeUnifi(), allowed.prisma, null);
  assert.strictEqual(allowed.activityRows.length, 1);
  assert.strictEqual(allowed.activityRows[0].eventType, 'bonus_start');
  assert.strictEqual(allowed.activityRows[0].deviceMac, MAC);

  // Blocked device: must resolve without throwing too.
  const blocked = makePrismaForStart({ active: false });
  await startBonusTime(1, 0, 30, makeUnifi(), blocked.prisma, null);
  assert.strictEqual(blocked.activityRows.length, 1);
  assert.strictEqual(blocked.activityRows[0].eventType, 'bonus_start');
  assert.strictEqual(blocked.activityRows[0].deviceMac, MAC);
});

test('bonusScheduler: startBonusTime sets active:true + blockBeforeBonus:true on a blocked device (T1)', async () => {
  const { prisma, deviceUpdates } = makePrismaForStart({ active: false });
  const unifi = makeUnifi();
  await startBonusTime(1, 0, 30, unifi, prisma, null);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus === true);
  assert.ok(flagUpdate, 'expected an update writing blockBeforeBonus:true');
  assert.strictEqual(flagUpdate.data.active, true);
  // clearBlock was called with the resolved mode -> unblockClient invoked.
  assert.deepStrictEqual(unifi._unblockCalls, [MAC]);
});

test('bonusScheduler: startBonusTime does not set blockBeforeBonus on an allowed device (T2)', async () => {
  const { prisma, deviceUpdates } = makePrismaForStart({ active: true });
  const unifi = makeUnifi();
  await startBonusTime(1, 0, 30, unifi, prisma, null);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus !== undefined);
  assert.strictEqual(flagUpdate, undefined);
  assert.deepStrictEqual(unifi._unblockCalls, []);
});

// ---------------------------------------------------------------------------
// restartPausedJobs
// ---------------------------------------------------------------------------

test('bonusScheduler: restartPausedJobs re-blocks a device with blockBeforeBonus set (T3)', async () => {
  const { prisma, deviceUpdates, activityRows } = makePrismaForRestart({ blockBeforeBonus: true });
  const unifi = makeUnifi({ blockResult: true });
  await restartPausedJobs(1, unifi, prisma, async () => {}, null);
  assert.deepStrictEqual(unifi._blockCalls, [MAC]);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus === false);
  assert.ok(flagUpdate, 'expected an update clearing blockBeforeBonus');
  assert.strictEqual(flagUpdate.data.active, false);
  const blockRow = activityRows.find((r) => r.eventType === 'block' && r.detail === 'bonus_expiry');
  assert.ok(blockRow, 'expected a bonus_expiry block activity row');
  assert.strictEqual(blockRow.blockMode, 'full');
});

test('bonusScheduler: restartPausedJobs does not re-block when blockBeforeBonus is null (T4)', async () => {
  const { prisma, deviceUpdates } = makePrismaForRestart({ blockBeforeBonus: null });
  const unifi = makeUnifi({ blockResult: true });
  await restartPausedJobs(1, unifi, prisma, async () => {}, null);
  assert.deepStrictEqual(unifi._blockCalls, []);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus !== undefined);
  assert.strictEqual(flagUpdate, undefined);
});

test('bonusScheduler: restartPausedJobs leaves blockBeforeBonus set when the re-block fails (T5)', async () => {
  const { prisma, deviceUpdates } = makePrismaForRestart({ blockBeforeBonus: true });
  const unifi = makeUnifi({ blockResult: false });
  await restartPausedJobs(1, unifi, prisma, async () => {}, null);
  assert.deepStrictEqual(unifi._blockCalls, [MAC]);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus === false);
  assert.strictEqual(flagUpdate, undefined);
});

// ---------------------------------------------------------------------------
// reArmDeviceBonusOnBoot
// ---------------------------------------------------------------------------

test('bonusScheduler: reArmDeviceBonusOnBoot re-blocks an expired device with blockBeforeBonus set (T6)', async () => {
  const expired = { id: 5, macAddress: MAC, bonusTimeExpiresAt: new Date(Date.now() - 60000).toISOString(), blockBeforeBonus: true };
  const deviceUpdates = [];
  const blockCalls = [];
  const prisma = {
    device: {
      findMany: async () => [expired],
      findUnique: async ({ where }) => {
        return { id: where.id, name: 'Test Device', macAddress: MAC, blockBeforeBonus: true, blockMode: null, deviceGroup: null };
      },
      update: async ({ where, data }) => {
        deviceUpdates.push({ where, data });
        return {};
      },
    },
    cronBonusToggles: { findMany: async () => [] },
    easyBonusToggles: { findMany: async () => [] },
    activityLog: { create: async () => ({}) },
    credentials: { findUnique: async () => ({ defaultBlockMode: null }) },
  };
  const unifi = {
    blockClient: async (mac) => {
      blockCalls.push(mac);
      return true;
    },
    unblockClient: async () => true,
    customApiRequest: async () => [],
  };
  const result = await reArmDeviceBonusOnBoot(unifi, prisma, async () => {}, null);
  assert.strictEqual(result.rearmed, 0);
  assert.strictEqual(result.expired, 1);
  assert.deepStrictEqual(blockCalls, [MAC]);
  const flagUpdate = deviceUpdates.find((u) => u.data && u.data.blockBeforeBonus === false);
  assert.ok(flagUpdate, 'expected the boot path to clear blockBeforeBonus');
  assert.strictEqual(flagUpdate.data.active, false);
});
