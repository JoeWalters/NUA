// devices routes for NUA server.
// Registered via registerdevices(app, ctx) from app.js.

const { applyBlock, clearBlock, resolveBlockMode } = require('../server_util_funcs/blockMode');
const { pauseDevice, unpauseDevice } = require('../server_util_funcs/pauseTimer');
const { logActivity } = require('../server_util_funcs/activityLog');

function registerdevices(app, ctx) {
  const {
    prisma,
    schedule,
    withUnifiRetry,
    isUnauthorizedUnifiError,
    getBlockedUsers,
    unBlockMultiple,
    unblockSingle,
    isValidMac,
    sendError,
    handleLoginError,
    isDiagnosticsEnabled,
    stopBonusTime,
    timeoutMap,
  } = ctx;
  const getUnifi = ctx.getUnifi;

  app.get('/getmacaddresses', async (req, res) => {
    try {
      const currentCredentials = await prisma.credentials.findUnique({
        where: {
          id: 1
        }
      });
      const { initialSetup } = currentCredentials;
        
      console.log('🔍 /getmacaddresses - initialSetup:', initialSetup, 'unifi connected:', !!getUnifi());

      if (!initialSetup) {
        const macData = await prisma.device.findMany({
          include: {
            deviceGroup: true
          }
        });
        let blockedUsers = [];
        let unifiSyncOk = false;

        // Read-only reconciliation: never mutate DB during refresh fetch.
        try {
          if (getUnifi()) {
            const blockedUsersResponse = await withUnifiRetry(() => getUnifi().getBlockedUsers());
            blockedUsers = Array.isArray(blockedUsersResponse) ? blockedUsersResponse : [];
            unifiSyncOk = true;
          }
        } catch (blockedUsersError) {
          console.warn('Failed to refresh blocked users from UniFi, serving DB fallback:', blockedUsersError?.message || blockedUsersError);
        }

        let responseMacData = macData;
        if (unifiSyncOk) {
          const blockedMacSet = new Set(
            blockedUsers
              .filter((device) => device?.blocked === true && typeof device?.mac === 'string')
              .map((device) => device.mac)
          );

          responseMacData = macData.map((device) => ({
            ...device,
            active: !blockedMacSet.has(device.macAddress)
          }));
        }

        return res.json({
          macData: responseMacData,
          blockedUsers,
          stale: !unifiSyncOk,
          stateSource: unifiSyncOk ? 'unifi-reconciled' : 'database-fallback'
        });
      } else {
        console.log('⚠️ Initial setup flag is true, checking if UniFi is actually connected...');
            
        // If UniFi is connected but initialSetup is still true, fix the flag
        if (getUnifi()) {
          console.log('🔧 UniFi is connected but initialSetup is true - fixing database flag');
          await prisma.credentials.update({ 
            where: { id: 1 }, 
            data: { initialSetup: false } 
          });
                
          // Now proceed with normal device loading
          let macData = await prisma.device.findMany({
            include: {
              deviceGroup: true
            }
          });
          const blockedUsers = await getBlockedUsers();
                
          return res.json({
            macData: macData,
            blockedUsers: blockedUsers,
            stale: false,
            stateSource: 'unifi-reconciled'
          });
        } else {
          throw new Error('This is the initial setup, redirect.');
        }
      }
    } catch (error) {
      console.error('error in /getmacaddresses: \t', error);
      handleLoginError(error);
      const diag = await isDiagnosticsEnabled(prisma);
      return res.status(401).json({
        success: false,
        error: 'Failed to fetch device state. Please verify site settings.',
        ...(diag ? { details: error?.message || 'Unknown error' } : {})
      });
    }
  });

  app.get('/pingmacaddresses', async (req, res) => {
    try {
      const checkForInitial = await prisma.credentials.findUnique({ where: { id: 1 } });
      const { initialSetup } = checkForInitial;
      const sendFakeEventObj = { refresh: true };

      if (initialSetup === false) {
      // const refreshRate = checkForInitial.refreshRate;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendUpdate = () => {
          res.write(`data: ${JSON.stringify({ sendFakeEventObj })}\n\n`);
        };
        sendUpdate();
        let refreshRate = checkForInitial.refreshRate;

        if (typeof refreshRate !== 'number') {
          refreshRate = 60000;
        }
        const intervalId = setInterval(sendUpdate, refreshRate);


        req.on('close', () => {
          clearInterval(intervalId);
        });
      }
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.post('/addmacaddresses', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { name, macAddress } = req.body;
    if (!isValidMac(macAddress)) {
      return res.status(400).json({ error: 'Invalid MAC address format.' });
    }
    const blockedUsers = await getBlockedUsers();

    const filterBlockedUsers = blockedUsers.filter((device) => {
      return device.mac === macAddress;
    });

    try {
      if (!filterBlockedUsers.length) {

        const newMacAddress = await prisma.device.create({
          data: {
            name,
            macAddress,
            active: true
          },
        });
        res.send({ newMacAddress });
      } else {

        const newMacAddress = await prisma.device.create({
          data: {
            name,
            macAddress,
            active: false
          },
        });
        res.send({ newMacAddress });
      }
    } catch (error) {
      console.error('Error adding device:', error);
      await sendError(res, error, 'There was an error adding the device.');
    }

  // try {
  //     const newMacAddress = await prisma.device.create({
  //         data: {
  //             name,
  //             macAddress,
  //             active: true
  //         },
  //     });
  //     res.send({ newMacAddress });
  // } catch (error) {
  //     if (error) throw error;
  //     res.send({ message: "There was an error."})
  // }
  });

  app.post('/addtodevicelist', async (req, res) => {
    const { customName, hostname, oui, mac, blocked } = req.body; // blocked: true
    if (!isValidMac(mac)) {
      return res.status(400).json({ error: 'Invalid MAC address format.' });
    }
    try {
      let name;
      if (customName) {
        name = customName;
      } else if (hostname) {
        name = hostname;
      } else if (mac) {
        name = mac;
      } else {
        name = 'Unnamed Device';
      }
      const deviceAddedToList = await prisma.device.create({
        data: {
          name: name,
          macAddress: mac,
          active: !blocked
        },
      });
      res.send({ deviceAddedToList });
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/getspecificdevice', async (req, res) => { // fetch individual device (cron manager)
    const { id } = req.body;
    try {
      const deviceInfo = await prisma.device.findUnique({
        where: {
          id: id
        }
      });
      res.json(deviceInfo);
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.put('/updatemacaddressstatus', async (req, res) => { // toggler
    try {
    // Check if UniFi is connected
      if (!getUnifi()) {
        return res.status(503).json({ 
          error: 'UniFi controller not connected', 
          message: 'Please configure UniFi credentials at /sitesettings',
          success: false
        });
      }

      //bypass front end active for now
      const { id, macAddress, active, bonusTimeActive } = req.body;
      if (!isValidMac(macAddress)) {
        return res.status(400).json({ error: 'Invalid MAC address format.' });
      }
      if (timeoutMap.get(id)) {
        await stopBonusTime(id, true, schedule, prisma, getUnifi());
        res.json({ msg: 'Stop Bonus Time fired in updatemacaddressstatus'});
        return;
      }

      // Look up the device's resolved block mode from the DB. Falls back to 'full'.
      let blockMode = 'full';
      try {
        const deviceRecord = await prisma.device.findUnique({
          where: { id: parseInt(id) },
          include: { deviceGroup: true },
        });
        blockMode = await resolveBlockMode(prisma, deviceRecord);
      } catch (lookupError) {
        console.warn('updatemacaddressstatus: blockMode lookup failed, defaulting to "full":', lookupError?.message || lookupError);
      }

      let unifiSuccess = false;
      let actualStatus = active;
      let operationMessage = '';
        
      try {
        if (active) {
        // Device is currently active, so we want to block it
          const result = await applyBlock(macAddress, blockMode, getUnifi(), prisma);
          unifiSuccess = result;
          actualStatus = !unifiSuccess; // If blocked successfully, device becomes inactive
          operationMessage = unifiSuccess ? 'blocked' : 'block failed';
          console.log(`Block operation for ${macAddress} (${blockMode}): ${unifiSuccess ? 'SUCCESS' : 'FAILED'}`);
        } else {
        // Device is currently blocked, so we want to unblock it
          const result = await clearBlock(macAddress, blockMode, getUnifi(), prisma);
          unifiSuccess = result;
          actualStatus = unifiSuccess; // If unblocked successfully, device becomes active
          operationMessage = unifiSuccess ? 'unblocked' : 'unblock failed';
          console.log(`Unblock operation for ${macAddress} (${blockMode}): ${unifiSuccess ? 'SUCCESS' : 'FAILED'}`);
        }
      } catch (unifiError) {
        console.error('UniFi operation failed:', unifiError);
        const diag = await isDiagnosticsEnabled(prisma);
        return res.status(500).json({ 
          error: 'UniFi operation failed', 
          success: false,
          currentStatus: active,
          ...(diag ? { details: unifiError.message } : {})
        });
      }

      // Only update database if UniFi operation succeeded
      if (unifiSuccess) {
        const deviceRecord = await prisma.device.findUnique({ where: { id: parseInt(id) } });
        const deviceName = deviceRecord?.name || macAddress;

        const updateUser = await prisma.device.update({
          where: {
            id,
            macAddress
          },
          data: {
            active: actualStatus,
          // bonusTimeActive: false // necessary 11/26/2024
          }
        });

        logActivity(prisma, active ? 'block' : 'unblock', {
          deviceName,
          deviceMac: macAddress,
          blockMode,
          detail: 'manual_toggle',
        });
            
        // Get current blocked users for response consistency
        const blockedUsers = await getBlockedUsers();
            
        res.json({ 
          updatedUser: updateUser, 
          blockedUsers: blockedUsers,
          success: true,
          message: `Device ${operationMessage} successfully`,
          actualStatus: actualStatus
        });
      } else {
      // UniFi operation failed - don't update database
        console.error(`Failed to ${active ? 'block' : 'unblock'} device ${macAddress}`);
        res.status(500).json({ 
          error: `Failed to ${active ? 'block' : 'unblock'} device`,
          success: false,
          currentStatus: active,
          message: `UniFi ${operationMessage}`
        });
      }
        
    } catch (error) {
      console.error('Toggle operation failed:', error);
      const diag = await isDiagnosticsEnabled(prisma);
      res.status(500).json({ 
        error: 'Internal server error',
        success: false,
        ...(diag ? { details: error.message } : {})
      });
    }
  });

  app.put('/blockallmacs', async (req, res) => {
    try {
      const { macData = [] } = req.body;
      if (!Array.isArray(macData)) {
        return res.status(400).json({ success: false, error: 'Invalid request body. Expected macData array.' });
      }

      const deviceIdList = macData.map((mac) => {
        return mac?.id; // device ids of user devices
      });
      // console.log('data in blockallmacs\t', macData);
      // console.log('deviceIdList in blockallmacs\t', deviceIdList);
      // console.log('blockedUsers from req.body\t', blockedUsers);

      for (const device of deviceIdList) {
        await stopBonusTime(device, true, schedule, prisma, getUnifi()); // will bonus time crash if there is no bonus time
      }


      //////////////////////////////
      // endTimeout(timerId)
      // stopBonusTime(deviceId, cancelTimer, schedule, prisma, unifi, res)
      ////////////////////////////
      // I dont think we need this updated records, stopBonusTime handles deletes and re-instates 12/2/2024 commented all out
      // const updatedData = {
      //     active: false,
      //     bonusTimeActive: false
      // }
      // const filtMacs = extractMacs(req.body); // what is this
      // await blockMultiple(filtMacs);          // what is this
      // const updatedRecords = await prisma.device.updateMany({
      //     where: {
      //         id: {
      //             in: deviceIdList,
      //         }
      //     },
      //     data: updatedData
      // });
      // res.json({ updatedRecords });
      return res.json({
        success: true,
        msg: 'All mac addresses blocked, jobs reinitiated, bonus time ended',
        deviceCount: deviceIdList.length
      });
    /////////////////////////////
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Failed to block all devices.' });
    }
  });

  app.put('/unblockallmacs', async (req, res) => {
    const { macData = [] } = req.body;
    if (!Array.isArray(macData)) {
      return res.status(400).json({ success: false, error: 'Invalid request body. Expected macData array.' });
    }

    const filteredIds = macData
      .map((mac) => mac?.id)
      .filter((id) => Number.isInteger(id));

    const filteredMacs = macData
      .map((mac) => mac?.macAddress)
      .filter((macAddress) => isValidMac(macAddress));

    const updatedData = {
      active: true
    };
    try {
      await unBlockMultiple(filteredMacs);
      const updatedRecords = await prisma.device.updateMany({
        where: {
          id: {
            in: filteredIds,
          }
        },
        data: updatedData
      });
      return res.json({
        success: true,
        msg: 'All mac addresses unblocked',
        updatedCount: updatedRecords?.count || 0
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Failed to unblock all devices.' });
    }
  });

  app.post('/unblockmac', async (req, res) => {
    const { mac, prismaDeviceId } = req.body;
    if (!isValidMac(mac)) {
      return res.status(400).json({ error: 'Invalid MAC address format.' });
    }
    console.log(mac);
    if (await isDiagnosticsEnabled(prisma)) {
      console.log(req.body);
    }
    try {
      await unblockSingle(mac);
      if (prismaDeviceId !== null) {
        const updateIfOnList = await prisma.device.update({
          where: {
            id: prismaDeviceId
          },
          data: {
            active: true
          }
        });
        console.log('updated if on list: ', updateIfOnList);
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Failed to unblock device.' });
    }
  });

  app.put('/updatedevicedata', async (req, res) => { // Devices.jsx device edit
    const { name, macAddress, id, blockMode } = req.body;
    if (!isValidMac(macAddress)) {
      return res.status(400).json({ error: 'Invalid MAC address format.' });
    }
    const VALID_BLOCK_MODES = ['full', 'internet', 'speedlimit', 'inherit'];
    if (blockMode !== undefined && !VALID_BLOCK_MODES.includes(blockMode)) {
      return res.status(400).json({ error: `Invalid block mode. Must be one of: ${VALID_BLOCK_MODES.join(', ')}.` });
    }
    try {
      const updatedDeviceData = await prisma.device.update({
        where: {
          id: parseInt(id),
        },
        data: {
          name: name,
          macAddress: macAddress,
          ...(blockMode !== undefined ? { blockMode: blockMode === 'inherit' ? null : blockMode } : {}),
        }
      });
      res.json(updatedDeviceData);
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.delete('/removedevice', async (req, res) => { // Devices.jsx device delete
    const { id } = req.body;
    const removeDevice = await prisma.device.delete({
      where: {
        id: parseInt(id),
      }
    });
    // delete crons - perhaps make all crons contain a deviceId as xubuntu device does
    // cancel jobs associated (if exist)
    res.json({ message: 'Deletion successful', dataDeleted: removeDevice });
  });

  app.get('/getallblockeddevices', async (req, res) => {
    try {
      const blockedUsers = await getBlockedUsers();
      const deviceList = await prisma.device.findMany();
      return res.json({ blockedUsers: blockedUsers, deviceList: deviceList });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Failed to fetch blocked devices.' });
    }
  });

  app.get('/getalldevices', async (req, res) => {
    try {
    // const getAccessDevices = await unifi.getAccessDevices();
      const getClientDevices = await withUnifiRetry(() => getUnifi().getAllUsers());
      // const getClientDevices = await unifi.getClientDevices();
      const getDeviceList = await prisma.device.findMany({
        include: {
          deviceGroup: true
        }
      });
      // console.log(getClientDevices);
      res.json({ getClientDevices: getClientDevices, getDeviceList: getDeviceList });
    // res.sendStatus(200)
    } catch (error) {
      console.error('Error in /getalldevices:', error);
      if (isUnauthorizedUnifiError(error)) {
        return res.status(401).json({ error: 'UniFi authorization failed. Please verify credentials in /sitesettings.' });
      }
      return res.status(503).json({ error: 'Unable to fetch devices from UniFi controller.' });
    }
  });

  app.get('/getcurrentdevices', async (req, res) => {
    try {
      const getDeviceList = await prisma.device.findMany({
        include: {
          deviceGroup: true
        }
      });
      res.json({ getDeviceList: getDeviceList });
    } catch (error) {
      console.error(error);
    }
  });

  app.put('/updatedeviceorder', async (req, res) => {
    const { newData } = req.body;
    try {
      const updateOrder = async () => {
        for (const device of newData) {
          await prisma.device.update({
            where: {
              id: device.id
            },
            data: {
              order: parseInt(device.order)
            }
          });
        }
      };
      updateOrder();
      // res.json({ message: 'Updated Successful'})
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
    }
  });

  // --- Pause Internet Timer ---

  app.post('/pause-device', async (req, res) => {
    const { deviceId, preset } = req.body;
    try {
      if (!getUnifi()) {
        return res.status(503).json({
          success: false,
          error: 'UniFi controller not connected',
          message: 'Please configure UniFi credentials at /sitesettings',
        });
      }
      if (!deviceId) {
        return res.status(400).json({ success: false, error: 'deviceId is required' });
      }
      const result = await pauseDevice(deviceId, preset, getUnifi(), prisma);
      return res.json({ success: true, timer: result.timer, pausedUntil: result.pausedUntil });
    } catch (error) {
      console.error('Error pausing device:', error);
      const diag = await isDiagnosticsEnabled(prisma);
      return res.status(500).json({
        success: false,
        error: 'Failed to pause device',
        ...(diag ? { details: error?.message || 'Unknown error' } : {}),
      });
    }
  });

  app.post('/unpause-device', async (req, res) => {
    const { deviceId } = req.body;
    try {
      if (!getUnifi()) {
        return res.status(503).json({
          success: false,
          error: 'UniFi controller not connected',
          message: 'Please configure UniFi credentials at /sitesettings',
        });
      }
      if (!deviceId) {
        return res.status(400).json({ success: false, error: 'deviceId is required' });
      }
      const success = await unpauseDevice(deviceId, getUnifi(), prisma);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Device not found' });
      }
      const blockedUsers = await getBlockedUsers();
      return res.json({ success: true, blockedUsers });
    } catch (error) {
      console.error('Error unpausing device:', error);
      const diag = await isDiagnosticsEnabled(prisma);
      return res.status(500).json({
        success: false,
        error: 'Failed to unpause device',
        ...(diag ? { details: error?.message || 'Unknown error' } : {}),
      });
    }
  });

  app.get('/getpausetimer', async (req, res) => {
    const { deviceId } = req.body;
    try {
      const t = timeoutMap.get(deviceId)?.time;
      if (t) {
        return res.json({ timer: t - Date.now() });
      }
      // Restart-safe fallback: read the persisted pausedUntil.
      const device = await prisma.device.findUnique({ where: { id: deviceId } });
      if (device?.pausedUntil) {
        const expiry = new Date(device.pausedUntil).getTime();
        return res.json({ timer: Math.max(expiry - Date.now(), 0) });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('Error in /getpausetimer:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch pause timer' });
    }
  });

  // --- Activity Log ---

  app.get('/activity-log', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const logs = await prisma.activityLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return res.json({ success: true, logs });
    } catch (error) {
      console.error('Error in /activity-log:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch activity log' });
    }
  });
}

module.exports = { registerdevices };
