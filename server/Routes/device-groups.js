// device-groups routes for NUA server.
// Registered via registerdevicegroups(app, ctx) from app.js.

function registerdevicegroups(app, ctx) {
  const {
    prisma,
    schedule,
    convertToMilitaryTime,
    dateFromDateString,
    sendError,
  } = ctx;
  const getUnifi = ctx.getUnifi;


  async function executeGroupSchedule(groupId, blockAllow, getUnifi, prisma) {
    try {
      const group = await prisma.deviceGroup.findUnique({
        where: { id: groupId },
        include: { devices: true }
      });
      if (!group || !group.devices.length) {
        console.log(`No devices found in group ${groupId}`);
        return;
      }
      for (const device of group.devices) {
        try {
          if (blockAllow === 'block') {
            await getUnifi().blockClient(device.macAddress);
            await prisma.device.update({ where: { id: device.id }, data: { active: false } });
          } else {
            await getUnifi().unblockClient(device.macAddress);
            await prisma.device.update({ where: { id: device.id }, data: { active: true } });
          }
          console.log(`${blockAllow}ed device ${device.macAddress} in group ${group.name}`);
        } catch (error) {
          console.error(`Failed to ${blockAllow} device ${device.macAddress}:`, error);
        }
      }
    } catch (error) {
      console.error('Error executing group schedule:', error);
    }
  }

  function createCronPattern(hour, minute, ampm, daysOfWeek) {
    const militaryHour = convertToMilitaryTime(ampm, hour);
    const daysPattern = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek.join(',') : '*';
    return `${minute} ${militaryHour} * * ${daysPattern}`;
  }


  app.get('/api/device-groups', async (req, res) => {
    try {
      console.log('📥 GET /api/device-groups - Fetching all device groups');
        
      // First, try a simple query without includes
      console.log('🔧 Attempting simple query first...');
      const simpleGroups = await prisma.deviceGroup.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });
      console.log(`✅ Simple query found ${simpleGroups.length} device groups`);
        
      // Now try with includes
      console.log('🔧 Attempting query with device relationships...');
      const groups = await prisma.deviceGroup.findMany({
        include: {
          devices: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      console.log(`✅ Full query found ${groups.length} device groups with relationships`);
      res.json(groups);
    } catch (error) {
      console.error('❌ Error fetching device groups:', error.message);
      console.error('📋 Full error:', error);
      await sendError(res, error, 'Failed to fetch device groups');
    }
  });

  app.post('/api/device-groups', async (req, res) => {
    try {
      const { name, description, color, icon } = req.body;
        
      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const group = await prisma.deviceGroup.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          color: color || '#3B82F6',
          icon: icon || '👤'
        }
      });

      res.status(201).json(group);
    } catch (error) {
      console.error('Error creating device group:', error);
      res.status(500).json({ error: 'Failed to create device group' });
    }
  });

  app.put('/api/device-groups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, color, icon } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const group = await prisma.deviceGroup.update({
        where: { id: parseInt(id) },
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          color: color || '#3B82F6',
          icon: icon || '👤',
          updatedAt: new Date()
        }
      });

      res.json(group);
    } catch (error) {
      console.error('Error updating device group:', error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device group not found' });
      } else {
        res.status(500).json({ error: 'Failed to update device group' });
      }
    }
  });

  app.delete('/api/device-groups/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // First, unassign all devices from this group
      await prisma.device.updateMany({
        where: { deviceGroupId: parseInt(id) },
        data: { deviceGroupId: null }
      });

      // Then delete the group
      await prisma.deviceGroup.delete({
        where: { id: parseInt(id) }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting device group:', error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device group not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete device group' });
      }
    }
  });

  app.put('/api/device-groups/:id/devices', async (req, res) => {
    try {
      const { id } = req.params;
      const { deviceIds } = req.body;

      if (!Array.isArray(deviceIds)) {
        return res.status(400).json({ error: 'deviceIds must be an array' });
      }

      const groupId = parseInt(id);

      // First, unassign all devices from this group
      await prisma.device.updateMany({
        where: { deviceGroupId: groupId },
        data: { deviceGroupId: null }
      });

      // Then assign the selected devices to this group
      if (deviceIds.length > 0) {
        await prisma.device.updateMany({
          where: { id: { in: deviceIds } },
          data: { deviceGroupId: groupId }
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating device assignments:', error);
      res.status(500).json({ error: 'Failed to update device assignments' });
    }
  });

  app.post('/api/device-groups/:id/block', async (req, res) => {
    try {
      const { id } = req.params;
      const groupId = parseInt(id);

      // Get all devices in the group
      const devices = await prisma.device.findMany({
        where: { deviceGroupId: groupId }
      });

      if (devices.length === 0) {
        return res.json({ success: true, message: 'No devices in group' });
      }

      // Block each device via UniFi
      const macAddresses = devices.map(device => device.macAddress);
        
      for (const macAddress of macAddresses) {
        try {
          await getUnifi()?.blockClient(macAddress);
        } catch (error) {
          console.warn(`Failed to block device ${macAddress}:`, error);
        }
      }

      // Update database
      await prisma.device.updateMany({
        where: { deviceGroupId: groupId },
        data: { active: false }
      });

      res.json({ success: true, blockedDevices: devices.length });
    } catch (error) {
      console.error('Error blocking group devices:', error);
      res.status(500).json({ error: 'Failed to block group devices' });
    }
  });

  app.post('/api/device-groups/:id/unblock', async (req, res) => {
    try {
      const { id } = req.params;
      const groupId = parseInt(id);

      // Get all devices in the group
      const devices = await prisma.device.findMany({
        where: { deviceGroupId: groupId }
      });

      if (devices.length === 0) {
        return res.json({ success: true, message: 'No devices in group' });
      }

      // Unblock each device via UniFi
      const macAddresses = devices.map(device => device.macAddress);
        
      for (const macAddress of macAddresses) {
        try {
          await getUnifi()?.unblockClient(macAddress);
        } catch (error) {
          console.warn(`Failed to unblock device ${macAddress}:`, error);
        }
      }

      // Update database
      await prisma.device.updateMany({
        where: { deviceGroupId: groupId },
        data: { active: true }
      });

      res.json({ success: true, unblockedDevices: devices.length });
    } catch (error) {
      console.error('Error unblocking group devices:', error);
      res.status(500).json({ error: 'Failed to unblock group devices' });
    }
  });

  app.put('/api/device-groups/:id/rules', async (req, res) => {
    try {
      const { id } = req.params;
      const { ruleIds } = req.body;
      if (!Array.isArray(ruleIds)) {
        return res.status(400).json({ error: 'ruleIds must be an array' });
      }

      const groupId = parseInt(id);
      await prisma.trafficRuleTags.deleteMany({ where: { deviceGroupId: groupId } });

      if (ruleIds.length > 0) {
        await prisma.trafficRuleTags.createMany({
          data: ruleIds.map(trafficRulesId => ({ deviceGroupId: groupId, trafficRulesId: parseInt(trafficRulesId) }))
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error assigning rules to group:', error);
      res.status(500).json({ error: 'Failed to assign rules to group' });
    }
  });

  app.get('/api/device-groups/:id/schedules', async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const schedules = await prisma.easySchedule.findMany({
        where: { deviceGroupId: groupId },
        orderBy: { createdAt: 'desc' }
      });
      res.json(schedules);
    } catch (error) {
      console.error('Error fetching group schedules:', error);
      res.status(500).json({ error: 'Failed to fetch group schedules' });
    }
  });

  app.post('/api/device-groups/:id/schedules', async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const { date, hour, minute, oneTime, blockAllow, modifiedDaysOfTheWeek, ampm } = req.body;

      // Verify the group exists
      const group = await prisma.deviceGroup.findUnique({
        where: { id: groupId },
        include: { devices: true }
      });

      if (!group) {
        return res.status(404).json({ error: 'Device group not found' });
      }

      // Create schedule entry in database
      const scheduleData = {
        minute: parseInt(minute),
        hour: oneTime ? convertToMilitaryTime(ampm, hour) : parseInt(hour),
        ampm,
        blockAllow,
        oneTime,
        deviceGroupId: groupId,
        toggleSched: true
      };

      if (oneTime) {
        const { year, month, day } = dateFromDateString(date);
        scheduleData.month = month;
        scheduleData.date = date;
            
        // Create the schedule date
        const dateTime = new Date(year, month-1, day, scheduleData.hour, scheduleData.minute, 0);
            
        // Create cron job
        const jobName = `group_${groupId}_${Date.now()}`;
        const job = schedule.scheduleJob(jobName, dateTime, async () => {
          await executeGroupSchedule(groupId, blockAllow, getUnifi(), prisma);
        });
            
        scheduleData.jobName = jobName;
      } else {
      // Recurring schedule
        const daysString = modifiedDaysOfTheWeek ? modifiedDaysOfTheWeek.join('') : '0123456';
        scheduleData.days = daysString;
            
        // Create cron job for recurring schedule
        const jobName = `group_${groupId}_${Date.now()}`;
        const cronPattern = createCronPattern(hour, minute, ampm, modifiedDaysOfTheWeek);
        const job = schedule.scheduleJob(jobName, cronPattern, async () => {
          await executeGroupSchedule(groupId, blockAllow, getUnifi(), prisma);
        });
            
        scheduleData.jobName = jobName;
      }

      // Save to database
      const newSchedule = await prisma.easySchedule.create({
        data: scheduleData
      });

      res.json({ success: true, schedule: newSchedule });
    } catch (error) {
      console.error('Error creating group schedule:', error);
      res.status(500).json({ error: 'Failed to create group schedule' });
    }
  });

  app.delete('/api/device-groups/:groupId/schedules/:scheduleId', async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.scheduleId);
      const groupId = parseInt(req.params.groupId);

      // Find and delete the schedule
      const scheduleRecord = await prisma.easySchedule.findFirst({
        where: { 
          id: scheduleId,
          deviceGroupId: groupId 
        }
      });

      if (!scheduleRecord) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // Cancel the cron job if it exists
      if (scheduleRecord.jobName) {
        const existingJob = schedule.scheduledJobs[scheduleRecord.jobName];
        if (existingJob) {
          existingJob.cancel();
        }
      }

      // Delete from database
      await prisma.easySchedule.delete({
        where: { id: scheduleId }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting group schedule:', error);
      res.status(500).json({ error: 'Failed to delete group schedule' });
    }
  });

  app.put('/api/device-groups/:groupId/schedules/:scheduleId/toggle', async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.scheduleId);
      const groupId = parseInt(req.params.groupId);
      const { toggleSched } = req.body;

      const schedule = await prisma.easySchedule.findFirst({
        where: { 
          id: scheduleId,
          deviceGroupId: groupId 
        }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // Handle group schedule toggling
      if (schedule.jobName) {
      // Cancel existing job using node-schedule
        const existingJob = schedule.scheduledJobs[schedule.jobName];
        if (existingJob) {
          existingJob.cancel();
        }
      }

      // Update the database record
      await prisma.easySchedule.update({
        where: { id: scheduleId },
        data: { toggleSched }
      });

      // If enabling the schedule, recreate the job
      if (toggleSched) {
        if (schedule.oneTime) {
          const { year, month, day } = dateFromDateString(schedule.date);
          const dateTime = new Date(year, month-1, day, schedule.hour, schedule.minute, 0);
                
          const jobName = `group_${groupId}_${Date.now()}`;
          const job = schedule.scheduleJob(jobName, dateTime, async () => {
            await executeGroupSchedule(groupId, schedule.blockAllow, getUnifi(), prisma);
          });
                
          // Update job name in database
          await prisma.easySchedule.update({
            where: { id: scheduleId },
            data: { jobName }
          });
        } else {
          const cronPattern = createCronPattern(schedule.hour, schedule.minute, schedule.ampm, schedule.days ? schedule.days.split('').map(d => parseInt(d)) : []);
                
          const jobName = `group_${groupId}_${Date.now()}`;
          const job = schedule.scheduleJob(jobName, cronPattern, async () => {
            await executeGroupSchedule(groupId, schedule.blockAllow, getUnifi(), prisma);
          });
                
          // Update job name in database
          await prisma.easySchedule.update({
            where: { id: scheduleId },
            data: { jobName }
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error toggling group schedule:', error);
      res.status(500).json({ error: 'Failed to toggle group schedule' });
    }
  });
}

module.exports = { registerdevicegroups };
