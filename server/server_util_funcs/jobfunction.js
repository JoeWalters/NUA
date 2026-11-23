const { deleteCompletedJobs } = require('./ez_sched_utils/deleteCompletedJobs');
const { red } = require('./red');
const { applyBlock, clearBlock, resolveBlockMode } = require('./blockMode');
const { logActivity } = require('./activityLog');

// jobFunction is the single entry point for all scheduled block/allow actions.
// It looks up the device's blockMode from the DB and dispatches to the right
// mechanism: full block, internet block (firewall policy), or speed limit (qos-rule).
//
// The blockMode lookup is best-effort: if the device isn't in the DB yet or
// the lookup fails, it falls back to 'full' (the legacy behavior).
const jobFunction = async (crontype, macAddress, oneTime, unifi, prisma) => {
  try {
    if (crontype === undefined) {
      throw new Error('**block/allow must be specified for jobFunction, undefined was passed!**');
    }

    // Look up the device's resolved block mode and name. Falls back to 'full' if not found.
    let blockMode = 'full';
    let deviceName = macAddress;
    if (prisma && macAddress) {
      try {
        const device = await prisma.device.findUnique({
          where: { macAddress },
          include: { deviceGroup: true },
        });
        blockMode = await resolveBlockMode(prisma, device);
        if (device?.name) {
          deviceName = device.name;
        }
      } catch (lookupError) {
        console.warn('jobFunction: blockMode lookup failed, defaulting to "full":', lookupError?.message || lookupError);
      }
    }

    if (crontype === 'allow') {
      const success = await clearBlock(macAddress, blockMode, unifi, prisma);
      console.log(`${macAddress} cleared (${blockMode}): ${success}`);
      logActivity(prisma, 'unblock', {
        deviceName,
        deviceMac: macAddress,
        blockMode,
        detail: 'schedule_fire' + (oneTime ? ' (one-time)' : ''),
        success,
      });
      if (oneTime) {
        deleteCompletedJobs(prisma);
      }
    } else if (crontype === 'block') {
      const success = await applyBlock(macAddress, blockMode, unifi, prisma);
      console.log(`${macAddress} blocked (${blockMode}): ${success}`);
      logActivity(prisma, 'block', {
        deviceName,
        deviceMac: macAddress,
        blockMode,
        detail: 'schedule_fire' + (oneTime ? ' (one-time)' : ''),
        success,
      });
      if (oneTime) {
        deleteCompletedJobs(prisma);
      }
    }
  } catch (error) {
    red('~~~~~~CATCH BLOCK IN JOB FUNCITON~~~~~~', 'red');
    console.error(error);
  }
};

module.exports = { jobFunction };
