// schedules routes for NUA server.
// Registered via registerschedules(app, ctx) from app.js.

function registerschedules(app, ctx) {
  const {
    prisma,
    schedule,
    schedulerService,
    jobFunction,
    validateCron,
    sendError,
    isDiagnosticsEnabled,
    serverLogger,
    startBonusTime,
    deleteBonusToggles,
    clearBonusTimeExpiry,
    startTimeout,
    endTimeout,
    timeoutMap,
    bonusRestartPausedJobs,
    logger,
  } = ctx;
  const getUnifi = ctx.getUnifi;

  app.get('/checkjobreinitiation', async (req, res) => {
    try {
    // @todo - also pull from prisma.easyschedule.findMany(); for job re-initiation - 05 16 2024 // working on 06/10/2024
      const previousCronJobData = await prisma.cron.findMany();
      const getMacAddress = await prisma.device.findMany();
      const previousEzScheduleData = await prisma.easySchedule.findMany();

      // Use centralized scheduler service instead of direct node-schedule API calls (Phase 3)
      const { scheduledJobs } = schedulerService.getAllScheduledJobs();


      let matchingCronIds = [];
      let newCronJobNames = [];
      for (let i=0; i<previousCronJobData.length; i++) {
        const matchedMacAddress = getMacAddress.find(
          (item) => item.id === previousCronJobData[i].deviceId
        );
        if (matchedMacAddress) {
          matchingCronIds.push({
            ...previousCronJobData[i],
            matchedMacAddress
          });
        }
      }
      // RESCHEDULE JOBS using scheduler service
      for (const data of matchingCronIds) {
        if (!schedulerService.jobExists(data.jobName) && data.toggleCron === true) {
          let reInitiatedJob = schedulerService.reinitCronJob(data, data.matchedMacAddress.macAddress, jobFunction);
          newCronJobNames.push({...data, jobName: reInitiatedJob?.name});
        }
      }
      // DATABASE
      let updatedCronJobs = [];
      for (let i=0; i<newCronJobNames.length; i++) {
        const updateNewCronJobNames = await prisma.cron.update({
          where: {
            id: newCronJobNames[i].id
          },
          data: {
            jobName: newCronJobNames[i].jobName,
          }
        });
        updatedCronJobs.push(updateNewCronJobNames);
      }
      //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EZSched~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      let matchingEZIds = [];
      let newEZJobNames = [];
      for (let i=0; i<previousEzScheduleData.length; i++) {
        const matchedMacAddress = getMacAddress.find(
          (item) => item.id === previousEzScheduleData[i].deviceId
        );
        if (matchedMacAddress) {
          matchingEZIds.push({
            ...previousEzScheduleData[i],
            matchedMacAddress
          });
        }
      }

      for (const data of matchingEZIds) {
        if (data.days) { // added 07 24 2024: modifiedDaysOfTheWeek was undefined on job re-initiation, we are manually adding it to the data obj from days
          let d = data.days.split('').map(day => parseInt(day));
          data.modifiedDaysOfTheWeek = d;
        }
        if (!schedulerService.jobExists(data.jobName) && data.toggleSched) { // reschedule jobs === undefined
          if (data.oneTime) {
            if (data.date) { // job was in past, delete or reschedule
              let oneTimeScheduleDate = new Date(`${data.date} ${data.hour}:${data.minute}:00`);
              let currentDate = new Date();
              // console.log('oneTimeScheduleDate\t', oneTimeScheduleDate);
              // console.log('currentDate\t', currentDate);
              if (oneTimeScheduleDate < currentDate) {
                console.log('Date was less than current date');
                const deleteOldPrismaDate = await prisma.easySchedule.delete({ where: { id: data.id } });
                console.log('deleteOldPrismaDate\t', deleteOldPrismaDate);
              } else {
              // Use scheduler service for re-initiation (Phase 3)
                const reInitiatedJob = schedulerService.reinitOneTimeSchedule(data, data.matchedMacAddress.macAddress, jobFunction);
                console.log('reInitiatedJob OneTime Success! name:\t', reInitiatedJob?.name);
                newEZJobNames.push({ ...data, jobName: reInitiatedJob?.name });
              }
            }
          } else if (!data.oneTime) {
          // Use scheduler service for recurring schedule re-initiation (Phase 3)
            const reInitiatedJob = schedulerService.reinitRecurringSchedule(data, data.matchedMacAddress.macAddress, jobFunction);
            newEZJobNames.push({ ...data, jobName: reInitiatedJob?.name });
          }
        }
      }
      let updatedEZJobs = [];
      for (let i=0; i<newEZJobNames.length; i++) {
        const updatenewEZJobNames = await prisma.easySchedule.update({
          where: {
            id: newEZJobNames[i].id
          },
          data: {
            jobName: newEZJobNames[i].jobName,
          }
        });
        updatedEZJobs.push(updatenewEZJobNames);
      }
      res.json({
        previousCronJobData,
        previousEzScheduleData,
        getMacAddress,
        updatedEZJobs,
        updatedCronJobs
      });
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.post('/addschedule', async (req, res) => { // adds cron data specific front end device && cron validator
    const { id, crontype, croninput, toggleCron, jobName } = req.body;
    if (await isDiagnosticsEnabled(prisma)) {
      serverLogger(JSON.stringify(req.body), 'nua.log');
    }
    try {
      const deviceToSchedule = await prisma.device.findUnique({
        where: {
          id: id
        }
      });
      console.log('Device to schedule ', deviceToSchedule); // job creation removed from here spefically to be performed in /togglecron

      if (validateCron(croninput)) {
        const addCron = await prisma.cron.create({ // create cron
          data: {
            crontype: crontype,
            crontime: croninput,
            jobName: '',
            toggleCron: toggleCron,
            device: {
              connect: { id: id }
            },
          }
        });

        const getMacAddress = await prisma.device.findUnique({ where: { id: id} });
        console.log('getMacAddress.macAddress: ', getMacAddress.macAddress);
        console.log('continue new');

        // Use schedulerService instead of direct node-schedule API (Phase 4)
        const startNewJob = await schedulerService.createCronJob(
          croninput,
          () => jobFunction(crontype, getMacAddress.macAddress, false, getUnifi(), prisma)
        );

        if (addCron) { // add device id
          const updateCronJobName = await prisma.cron.update({
            where: { id: addCron.id },
            data: {
              deviceId: id,
              jobName: startNewJob.name
            }
          });
        }
        res.json(addCron);
      } else {
        res.status(422).send({ message: 'Invalid Cron Type, please try again.' });
      }
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.delete('/deletecron', async (req, res) => {
    const { parseId, jobName } = req.body;
    try {
      const deleteCron = await prisma.cron.delete({
        where: {
          id: parseId
        }
      });
      console.log('jobName: \t', jobName);
      const jobToCancel = schedule.scheduledJobs[jobName];
      console.log('Job Name cancelled: ', jobToCancel?.name);
      jobToCancel?.cancel();

      res.json({ message: 'Data Deleted Succesfully.', dataDeleted: deleteCron });

    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.put('/togglecron', async (req, res) => {
    const { id, toggleCron, jobName, crontime, crontype, deviceId } = req.body;
    // serverLogger(`Toggle on off ${toggleCron}`, "nua.log");
    // const { id, deviceId, jobName, ezBlockAllow, ezDate, toggleEZSched } = req.body
    let jb = jobName;
    try {
      const getMacAddress = await prisma.device.findUnique({ where: { id: deviceId } });
      console.log('getMacAddress.macAddress: ', getMacAddress.macAddress);

      if (toggleCron === false && jobName !== '') {
      // Use schedulerService instead of direct node-schedule API (Phase 4)
        const cancelled = await schedulerService.cancelJob(jobName);
        console.log('Cancelled Job?: ', cancelled);
      } else if (toggleCron === true) {
        console.log('continue');

        // Use schedulerService instead of direct node-schedule API (Phase 4)
        const reInitiatedJob = await schedulerService.createCronJob(
          crontime,
          () => jobFunction(crontype, getMacAddress.macAddress, false, getUnifi(), prisma)
        );
        jb = reInitiatedJob.name;
        console.log('jb.name: ', jb.name);
      }
      const updateCronToggle = await prisma.cron.update({
        where: { id: id },
        data: {
          toggleCron: toggleCron,
          jobName: jb
        }
      });
      res.json(updateCronToggle);
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/getscheduledata', async (req, res) => { // fetches cron data specific to front end device
    const { id } = req.body;
    // console.log('id from getcrondata req.body ', id);
    // console.log('req.body from /getcrondata ', req.body);
    try {
      const cronData = await prisma.cron.findMany({
        where: {
          deviceId: id
        }
      });
      const ezScheduleData = await prisma.easySchedule.findMany({
        where: {
          deviceId: id
        }
      });
      res.json({ cronData, ezScheduleData });

      const getMacAddress = await prisma.device.findUnique({ where: { id: id } });
      // const { macAddress } = getMacAddress;
      // const { scheduledJobs } = schedule;

    // for (const data of cronData) { // 06 06 2024 - not sure the intention of this in hindsight, but also consider "undefined" vs undefined.
    //     console.log('#974: data.jobName ', data.jobName)
    //     console.log('data.jobName === undefined ', scheduledJobs[data.jobName] === undefined) // jobs not re initiated
    //     if (scheduledJobs[data.jobName] === undefined) {
    //         // update many and also make async ?
    //     }
    // }
    // console.log('jobs ', scheduledJobs[cronData[0].jobName] === undefined);
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.post('/addbonustime', async (req, res) => { // cron bonus time (Phase 5: uses bonusScheduler)
    try {
      const { hours, minutes, deviceId, isAdditionalTime } = req.body;

      if (hours || minutes) {
      // Start bonus time — pauses all active schedules and creates toggle records
        const currentExpiry = timeoutMap.get(deviceId)?.time;
        const originalTime = isAdditionalTime && currentExpiry ? Math.max(currentExpiry - Date.now(), 0) : null;
        await startBonusTime(deviceId, hours, minutes, getUnifi(), prisma, schedulerService, originalTime);

        // Set up timeout callback to restart paused jobs after bonus time ends
        const restartCallback = async () => {
          await bonusRestartPausedJobs(deviceId, getUnifi(), prisma, jobFunction, schedulerService);
          endTimeout(deviceId);
        };

        startTimeout(deviceId, minutes, hours, restartCallback, originalTime);
        const t = timeoutMap.get(deviceId)?.time;
        const newTime = t - Date.now();

        res.status(200).json({ msg: 'Confirmed', timer: newTime, timerId: deviceId });
      } else {
        res.status(422).send({ message: 'Hours or minutes required for bonus time.' });
      }
    } catch (error) {
      await sendError(res, error);
      console.error(error);
    }
  });

  app.post('/getbonustimesmap', async (req, res) => {
    try {
      const { deviceId } = req.body;
      const t = timeoutMap.get(deviceId)?.time;
      if (t) {
        const newTime = t - Date.now();
        res.status(200).json({ timer: newTime  });
      } else {
      // Restart-safe fallback: read the persisted expiry timestamp
        const device = await prisma.device.findUnique({
          where: { id: deviceId }
        });
        const expiresAt = device?.bonusTimeExpiresAt;
        if (expiresAt) {
          const remaining = new Date(expiresAt).getTime() - Date.now();
          if (remaining > 0) {
            res.status(200).json({ timer: remaining });
          } else {
            res.status(204).json({ msg: 'No timer information for this device.' });
          }
        } else {
          res.status(204).json({ msg: 'No timer information for this device.' });
        }
      }
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/deletebonustoggles', async (req, res) => { // stop timer and shutoff device (Phase 5: uses bonusScheduler)
    const { deviceId, cancelTimer } = req.body; // deviceId is the timerId
    try {
      if (cancelTimer) { // cancelling timer/ending timeout from /addbonustoggles
        endTimeout(deviceId);
      }

      const getMacAddressForDevice = await prisma.device.findUnique({ where: { id: deviceId }});

      // Delete bonus toggles and re-initiate all paused jobs (Phase 5)
      await deleteBonusToggles(deviceId, getUnifi(), prisma, jobFunction, schedulerService, logger);

      const confirmBlocked = await getUnifi()?.blockClient(getMacAddressForDevice.macAddress);
      console.log(`${getMacAddressForDevice.macAddress} has been blocked: ${confirmBlocked}`);
      await clearBonusTimeExpiry(deviceId, prisma);
      await prisma.device.update({
        where: { id: deviceId },
        data: {
          active: false
        }
      });

      res.sendStatus(200);
    } catch (error) {
      await sendError(res, error);
      console.error(error);
    }
  });
}

module.exports = { registerschedules };
