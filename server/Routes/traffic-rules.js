// traffic-rules routes for NUA server.
// Registered via registertrafficrules(app, ctx) from app.js.

function registertrafficrules(app, ctx) {
  const {
    prisma,
    withUnifiRetry,
    isUnauthorizedUnifiError,
    sendError,
    isDiagnosticsEnabled,
    startBonusRule,
    endBonusRule,
    startTimeout,
    endTimeout,
    timeoutMap,
    addTrafficRuleSchedule,
    toggleTrafficRuleSchedule,
    deleteTrafficRuleSchedule,
    unifiRequest,
  } = ctx;
  const getUnifi = ctx.getUnifi;

  app.get('/getdbcustomapirules', async (req, res) => { // get dbtrafficrules && unifi rules
    try {
      const path = '/v2/api/site/default/trafficrules';
      const result = await withUnifiRetry(() => getUnifi().customApiRequest(path, 'GET'));

      // TEMP DEBUG: dump a real rule so we can mirror UniFi's exact shape.
      const sampleRule = Array.isArray(result)
        ? result.find(r => r.bandwidth_limit?.enabled) || result[0]
        : null;
      if (sampleRule) {
        console.log('DEBUG full rule \t', JSON.stringify({
          matching_target: sampleRule.matching_target,
          ip_addresses: sampleRule.ip_addresses,
          ip_ranges: sampleRule.ip_ranges,
          target_devices: sampleRule.target_devices,
          network_ids: sampleRule.network_ids,
          bandwidth_limit: sampleRule.bandwidth_limit,
          action: sampleRule.action,
        }));
      }

      const fetchTrafficRules = await prisma?.trafficRules?.findMany();
      const fetchAppCatIds = await prisma?.appCatIds?.findMany();
      const fetchAppIds = await prisma?.appIds?.findMany();
      const fetchTargetDevices = await prisma?.targetDevice?.findMany();
      const fetchRuleTags = await prisma?.trafficRuleTags?.findMany();
      const fetchDeviceGroups = await prisma?.deviceGroup?.findMany();
      const fetchTrafficRuleSchedules = await prisma?.trafficRuleSchedule?.findMany();

      const joinedData = fetchTrafficRules?.map((trafficRule) => {
        const matchingFetchAppCatIds = fetchAppCatIds.find(appCatId => appCatId.trafficRulesId === trafficRule.id);
        const matchingAppIds = fetchAppIds.filter(appId => appId.trafficRulesId === trafficRule.id);
        const matchingTargetDevices = fetchTargetDevices.filter(targetDevice => targetDevice.trafficRulesId === trafficRule.id);
        const ruleTagIds = (fetchRuleTags || []).filter(t => t.trafficRulesId === trafficRule.id).map(t => t.deviceGroupId);
        const ruleTags = (fetchDeviceGroups || []).filter(group => ruleTagIds.includes(group.id));
        const trafficRuleSchedules = (fetchTrafficRuleSchedules || [])
          .filter(scheduleRow => scheduleRow.trafficRulesId === trafficRule.id)
          .sort((a, b) => a.createdAt - b.createdAt);

        return {
          trafficRule,
          trafficRuleSchedules,
          matchingFetchAppCatIds,
          matchingAppIds,
          matchingTargetDevices,
          ruleTags
        };
      });
      if (joinedData.length) {
        return res.status(200).json({ trafficRuleDbData: joinedData, unifiData: result });
      }
      if (result.length && !joinedData.length) {
        return res.status(206).json({ unifiData: result });
      }
      return res.status(200).json({ trafficRuleDbData: [], unifiData: result || [] });
    } catch (error) {
      console.error('Error in /getdbcustomapirules:', error);
      if (isUnauthorizedUnifiError(error)) {
        return res.status(401).json({ error: 'UniFi authorization failed. Please verify credentials in /sitesettings.' });
      }
      return res.status(503).json({ error: 'Unable to fetch traffic rules from UniFi controller.' });
    }
  });

  app.post('/addcategorytrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { categoryObject, dbCatObject } = req.body;

    // console.log('categoryObject \t', categoryObject); // verified
    const { app_category_ids, description, enabled, matching_target, target_devices, categoryName, devices, action } = dbCatObject;

    console.log('devices \t', devices);
    console.log('app_category_ids \t', app_category_ids);

    try {
      const path = '/v2/api/site/default/trafficrules';
      const result = await getUnifi().customApiRequest(path, 'POST', categoryObject);
      // console.log('result \t', result);
      // console.log('result._id \t', result._id);

      const setTrafficRuleEntry = await prisma.trafficRules.create({
        data: {
          unifiId: result._id,
          description: description,
          enabled: enabled,
          blockAllow: action,
        }
      });
      const setAppCatIds = await prisma.appCatIds.create({
        data: {
          app_cat_id: app_category_ids[0].categoryId,
          app_cat_name: app_category_ids[0].categoryName,
          trafficRules: {
            connect: { id: setTrafficRuleEntry.id }
          }
        },
      });
      const setMultipleDevices = async () => {
        let allData = [];
        for (const device of devices) {
          const update = await prisma.trafficRuleDevices.create({
            data: {
              deviceName: device.name,
              deviceId: device.id,
              macAddress: device.macAddress,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            }
          });
          allData.push(update);
        }
        return allData;
      };
      await setMultipleDevices();


      const setMultipleTargetDevices = async () => {
        let allData = [];
        for (const td of target_devices) {
          const data = await prisma.targetDevice.create({
            data: {
              client_mac: td.client_mac,
              type: td.type,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            },
          });
          allData.push(data);
        }
        return allData;
      };
      await setMultipleTargetDevices();
      // console.log('setTrafficRuleEntry \t', setTrafficRuleEntry);
      // console.log('setAppCatIds \t', setAppCatIds);
      // console.log('setAppIds \t', setAppIds);
      // console.log('setTargetDevices \t', multipleData);
      if (result) {
        console.log('Result: \t', result);
        res.status(200).json({ success: true, result: result });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error?.response?.data });
      console.error(error);
    }
  });

  app.post('/addappstrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { appObject, appDbObject } = req.body;
    const { app_category_ids, app_ids, description, enabled, matching_target, target_devices, devices, action, appSelection } = appDbObject;
    console.log('appDbObject \t', appDbObject);
    let r;
    try {
      const path = '/v2/api/site/default/trafficrules';
      const result = await getUnifi().customApiRequest(path, 'POST', appObject);
      r = result;

      const setTrafficRuleEntry = await prisma.trafficRules.create({
        data: {
          unifiId: result._id,
          description: description,
          enabled: enabled,
          blockAllow: action
        }
      });
      // const setAppCatIds = await prisma.appCatIds.create({
      //     data: {
      //         app_cat_id: app_category_ids[0],
      //         trafficRules: {
      //             connect: { id: setTrafficRuleEntry.id }
      //         }
      //     },
      // });
      const setMultipleAppCatIds = async () => {
        let allData = [];
        for (const appCatIds of app_category_ids) {
          const setAppIds = await prisma.appCatIds.create({
            data: {
              app_cat_id: appCatIds.app_cat_id,
              app_cat_name: appCatIds.app_cat_name,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            }
          });
          allData.push(setAppIds);
        }
        return allData;
      };
      await setMultipleAppCatIds();

      const setMultipleAppIds = async () => {
        let allData = [];
        for (const appIds of appSelection) {
          const setAppIds = await prisma.appIds.create({
            data: {
              app_id: appIds.id,
              app_name: appIds.name,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            }
          });
          allData.push(setAppIds);
        }
        return allData;
      };
      await setMultipleAppIds();

      const setMultipleDevices = async () => {
        let allData = [];
        for (const device of devices) {
          const update = await prisma.trafficRuleDevices.create({
            data: {
              deviceName: device.name,
              deviceId: device.id,
              macAddress: device.macAddress,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            }
          });
          allData.push(update);
        }
        return allData;
      };
      await setMultipleDevices();
      const setMultipleTargetDevices = async () => {
        let allData = [];
        for (const td of target_devices) {
          const data = await prisma.targetDevice.create({
            data: {
              client_mac: td.client_mac,
              type: td.type,
              trafficRules: {
                connect: { id: setTrafficRuleEntry.id }
              }
            },
          });
          allData.push(data);
        }
        return allData;
      };
      await setMultipleTargetDevices();

      // res.sendStatus(200);
      if (result) {
        console.log('Result made it: \t', result);
        res.status(200).json({ success: true, result: result });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error?.response?.data });
      console.error(error);
    // console.log('error.response \t', error.response);
    // res.status(error.response.status).json({ error: error.response.data });
    }
  });

  app.post('/addspeedlimittrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { description, enabled, devices } = req.body;

    try {
    // Build a MAC -> IP map from the live client list (online, current IPs) plus
    // the all-users list (last-known IPs, so offline devices are still covered).
      const clientByMac = {};
      const addClients = (list) => {
        for (const client of list) {
          if (client.mac && client.ip) {
            clientByMac[client.mac.toLowerCase()] = client.ip;
          }
        }
      };
      addClients(await getUnifi().getClientDevices());
      addClients(await getUnifi().getAllUsers());

      // Target every selected device we have an IP for; skip the rest (e.g. a
      // device never seen online) rather than failing the whole rule.
      const targeted = devices.filter((d) => clientByMac[d.macAddress.toLowerCase()]);
      const skipped = devices.filter((d) => !clientByMac[d.macAddress.toLowerCase()]);

      if (!targeted.length) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No selected device has a known IP on the controller yet — try again after the device connects.',
          },
        });
      }

      const speedLimitObject = {
        action: 'ALLOW',
        app_category_ids: [],
        app_ids: [],
        bandwidth_limit: {
          download_limit_kbps: 1024,
          enabled: true,
          upload_limit_kbps: 1024,
        },
        description: description || 'Speed limit rule',
        domains: [],
        enabled: enabled,
        // matching_target is the rule's DESTINATION (App/Domain/IP/Region/
        // Internet/Local network). This modal only picks source clients + bandwidth
        // with no destination selector, so default to 'INTERNET' — it needs no
        // app_ids (avoids MissingApplication) and no local IP (avoids the
        // bandwidth-limiting-on-local-IP rejection). Clients are the source, listed
        // in target_devices ({ client_mac, type: 'CLIENT' }) like a real rule.
        ip_addresses: [],
        ip_ranges: [],
        matching_target: 'INTERNET',
        network_ids: [],
        regions: [],
        schedule: { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
        target_devices: targeted.map((d) => ({
          client_mac: d.macAddress,
          type: 'CLIENT',
        })),
      };

      // Set the requested limits (Mbps already converted to kbps by the client).
      speedLimitObject.bandwidth_limit.download_limit_kbps = req.body.downloadKbps;
      speedLimitObject.bandwidth_limit.upload_limit_kbps = req.body.uploadKbps;

      const path = '/v2/api/site/default/trafficrules';

      // TEMP DEBUG: fetch a real rule so we can mirror UniFi's exact speed-limit shape.
      const existingRules = await getUnifi().customApiRequest(path, 'GET');
      const sampleRule = Array.isArray(existingRules)
        ? existingRules.find(r => r.bandwidth_limit?.enabled) || existingRules[0]
        : null;
      if (sampleRule) {
        console.log('DEBUG full rule \t', JSON.stringify({
          matching_target: sampleRule.matching_target,
          ip_addresses: sampleRule.ip_addresses,
          ip_ranges: sampleRule.ip_ranges,
          target_devices: sampleRule.target_devices,
          network_ids: sampleRule.network_ids,
          bandwidth_limit: sampleRule.bandwidth_limit,
          action: sampleRule.action,
        }));
      } else {
        console.log('DEBUG no rules found');
      }

      const result = await getUnifi().customApiRequest(path, 'POST', speedLimitObject);

      const setTrafficRuleEntry = await prisma.trafficRules.create({
        data: {
          unifiId: result._id,
          description: description,
          enabled: enabled,
          blockAllow: 'ALLOW',
        },
      });

      for (const device of targeted) {
        await prisma.trafficRuleDevices.create({
          data: {
            deviceName: device.name,
            deviceId: device.id,
            macAddress: device.macAddress,
            trafficRules: {
              connect: { id: setTrafficRuleEntry.id },
            },
          },
        });
        await prisma.targetDevice.create({
          data: {
            client_mac: device.macAddress,
            type: 'CLIENT',
            trafficRules: {
              connect: { id: setTrafficRuleEntry.id },
            },
          },
        });
      }

      res.status(200).json({ success: true, result: result, skipped: skipped });
    } catch (error) {
      res.status(500).json({ success: false, error: error?.response?.data });
      console.error(error);
    }
  });

  app.put('/updatecategorytrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { categoryObject } = req.body;
    console.log('catId \t', categoryObject); // verified
    try {
    // console.log('unifi.customApiRequest \t', unifi.customApiRequest)
      const path = `/v2/api/site/default/trafficrules/${categoryObject._id}`;

      const result = await getUnifi().customApiRequest(path, 'PUT', categoryObject._id);
      console.log('result \t', result);
      // result?.map(r => console.log(r))
      // result.forEach(r => r.target_devices.forEach(device => console.log('target_devices \t', device)))

      // res.json(car)
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
    }
  });

  app.put('/updatetrafficruletoggle', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { _id, trafficRuleId, unifiObjCopy } = req.body;
    console.log('unifiObjCopy \t', unifiObjCopy);
    try {
      const path = `/v2/api/site/default/trafficrules/${_id}`;

      const result = await getUnifi().customApiRequest(path, 'PUT', unifiObjCopy);
      console.log('result \t', result);

      const updateTrafficRule = await prisma.trafficRules.update({
        where: {
          id: parseInt(trafficRuleId)
        },
        data: {
          enabled: unifiObjCopy.enabled
        }
      });
      console.log('updateTrafficRule \t', updateTrafficRule);
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error });
      console.error(error);
    }
  });

  app.put('/updatetrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { trafficRuleId, unifiRule, description, action, targetDevices = [], dbDevices = [] } = req.body;

    if (!trafficRuleId || !unifiRule || !unifiRule._id) {
      return res.status(400).json({ error: 'Missing trafficRuleId or unifiRule' });
    }

    try {
      const path = `/v2/api/site/default/trafficrules/${unifiRule._id}`;
      const result = await getUnifi().customApiRequest(path, 'PUT', unifiRule);

      const idToUse = parseInt(trafficRuleId);

      const updateTrafficRule = await prisma.trafficRules.update({
        where: { id: idToUse },
        data: {
          description: description,
          blockAllow: action,
        },
      });
      console.log('updated traffic rule 	', updateTrafficRule);

      // Replace the target device association rows with the new selection. When
      // the user didn't select any devices (e.g. the rule's device isn't in NUA's
      // local device list yet), keep the existing associations intact so the
      // rule still references its real target device.
      if (dbDevices.length) {
        await prisma.trafficRuleDevices.deleteMany({ where: { trafficRulesId: idToUse } });
        await prisma.targetDevice.deleteMany({ where: { trafficRulesId: idToUse } });

        for (const device of dbDevices) {
          await prisma.trafficRuleDevices.create({
            data: {
              deviceName: device.name,
              deviceId: device.id,
              macAddress: device.macAddress,
              trafficRules: {
                connect: { id: idToUse },
              },
            },
          });
          await prisma.targetDevice.create({
            data: {
              client_mac: device.macAddress,
              type: 'CLIENT',
              trafficRules: {
                connect: { id: idToUse },
              },
            },
          });
        }
      }

      res.status(200).json({ success: true, result: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error?.response?.data || error });
      console.error(error);
    }
  });

  app.delete('/deletecustomapi', async (req, res) => { // deletes unifi rule, not db (yet)
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { _id, trafficRuleId } = req.body;
    console.log('id of rule to delete \t', _id);
    console.log('trafficRuleId \t', trafficRuleId);
    const path = `/v2/api/site/default/trafficrules/${_id}`;
    try {
    // console.log('unifi.customApiRequest \t', unifi.customApiRequest)
      const checkForExistingUnifiRule = await getUnifi().customApiRequest('/v2/api/site/default/trafficrules', 'GET');
      console.log('checkForExistingUnifiRule \t', checkForExistingUnifiRule);
      const checkFilter = checkForExistingUnifiRule.filter((rule) => {
        return rule._id === _id;
      });
      if (checkFilter.length) {
        const result = await getUnifi().customApiRequest(path, 'DELETE', null);
        console.log('"DELETE" result: \t', result);
      }
      const deleteTrafficRuleAndAssociated = async (trafficRuleId) => {
        try {
          await prisma.$transaction(async (trule) => {
            await trule.appCatIds.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trule.appIds.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trule.targetDevice.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trule.trafficRuleDevices.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trule.trafficRuleSchedule.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trule.trafficRules.delete({ where: { id: trafficRuleId }});
          });
          console.log('Traffic Rule and associated entries deleted successfully!');
        } catch (error) {
          console.error('Error Deleting TrafficRule and associated entries.');
        } finally {
          await prisma.$disconnect();
        }
      };
      await deleteTrafficRuleAndAssociated(parseInt(trafficRuleId));

      res.status(200).json({ result: checkFilter });
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/importexistingunifirules', async (req, res) => {
    const { categoryClones, appClones } = req.body;

    try {
      if (categoryClones.length) {
        console.log('categoryClones \t', categoryClones);
        // Persist category-based rules (INTERNET, APP_CATEGORY) — previously these
        // were only logged and never written to the DB, so imported speed-limit
        // rules never appeared in the Traffic Rules list.
        for (const catClone of categoryClones) {
          const trafficRuleEntry = await prisma.trafficRules.create({
            data: {
              unifiId: catClone._id,
              description: catClone.description,
              enabled: catClone.enabled,
              blockAllow: catClone.action
            }
          });
          if (catClone.app_category_ids?.length) {
            for (const appCatNameId of catClone.app_category_ids) {
              await prisma.appCatIds.create({
                data: {
                  app_cat_id: appCatNameId.app_cat_id,
                  app_cat_name: appCatNameId.app_cat_name,
                  trafficRules: {
                    connect: { id: trafficRuleEntry.id }
                  }
                }
              });
            }
          }
          for (const catCloneTargetDevice of catClone.target_devices || []) {
            await prisma.targetDevice.create({
              data: {
                client_mac: catCloneTargetDevice.client_mac ? catCloneTargetDevice.client_mac : 'Not a client device',
                type: catCloneTargetDevice.type,
                trafficRules: {
                  connect: { id: trafficRuleEntry.id }
                }
              }
            });
          }
        }
      }
      if (appClones.length) {
        console.log('appClones \t', appClones);

        for (const appClone of appClones) {
          const trafficRuleEntry = await prisma.trafficRules.create({
            data: {
              unifiId: appClone._id,
              description: appClone.description,
              enabled: appClone.enabled,
              blockAllow: appClone.action
            }
          });
          if (appClone.app_category_ids.length) {
            for (const appCatNameId of appClone.app_category_ids) {
              const appCatIdsEntry = await prisma.appCatIds.create({ // need app_cat_name if exists // changed to appCatIds from appIds 02/15
                data: {
                  app_cat_id: appCatNameId.app_cat_id,
                  app_cat_name: appCatNameId.app_cat_name,
                  trafficRules: {
                    connect: { id: trafficRuleEntry.id }
                  }
                }
              });
            }
          }
          for (const appCloneNameIds of appClone.appSelection) {
            const appIdsEntry = await prisma.appIds.create({
              data: {
                app_id: appCloneNameIds.id,
                app_name: appCloneNameIds.name,
                trafficRules: {
                  connect: { id: trafficRuleEntry.id }
                }
              }
            });
          }
          for (const appCloneTargetDevice of appClone.target_devices) {

            const targetDeviceEntry = await prisma.targetDevice.create({
              data: {
                client_mac: appCloneTargetDevice.client_mac ? appCloneTargetDevice.client_mac : 'Not a client device',
                type: appCloneTargetDevice.type,
                trafficRules: {
                  connect: { id: trafficRuleEntry.id }
                }
              }
            });
          }
          // for (const appCloneTargetDevice of appClone.devices) {
          //     const trafficRuleDevicesEntry = await prisma.trafficRuleDevices.create({
          //         data: {
          //             deviceName: appCloneTargetDevice.deviceName ? appCloneTargetDevice.deviceName : "No Name Provided",
          //             // deviceId:
          //             macAddress: appCloneTargetDevice.macAddress,
          //             trafficRules: {
          //                 connect: { id: trafficRuleEntry.id }
          //             }
          //         }
          //     });
          //     // look into how to properly update the deviceId and which devices to add....
          //     const deviceEntryForUnifiRule = await prisma.device.create({
          //         data: {
          //             name: appCloneTargetDevice.oui ? appCloneTargetDevice.oui : appCloneTargetDevice.hostname ? appCloneTargetDevice.hostname : `"none"` ,
          //             macAddress: appCloneTargetDevice.macAddress,
          //             active: appClone.enabled
          //         }
          //     });

        //     const updateTrafficRuleDevicesEntry = await prisma.trafficRuleDevices.update({
        //         where: {
        //             id: trafficRuleDevicesEntry.id,
        //         },
        //         data: {
        //             deviceId: deviceEntryForUnifiRule.id,
        //         }
        //     });
        // }
        }
      }
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      res.sendStatus(502);
    }


  });

  app.delete('/unmanageapp', async (req, res) => {
    const { dbId } = req.body;
    try {
      const unmanageTrafficRule = async (trafficRuleId) => {
        try {
          await prisma.$transaction(async (trafficRule) => {
            await trafficRule.appCatIds.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trafficRule.appIds.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trafficRule.targetDevice.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trafficRule.trafficRuleDevices.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trafficRule.trafficRuleSchedule.deleteMany({ where: { trafficRulesId: trafficRuleId }});
            await trafficRule.trafficRules.delete({ where: { id: trafficRuleId }});
          });
          console.log(`Unmanaged traffic rule: ${dbId}, successfully!`);
          res.sendStatus(200);
        } catch (error) {
          console.error(error);
        } finally {
          await prisma.$disconnect();
        }
      };
      await unmanageTrafficRule(parseInt(dbId));

    } catch (error) {
      console.error(error);
    }
  });

  app.post('/addbonusrule', async (req, res) => { // bonus time for a traffic rule
    try {
      const { hours, minutes, trafficRuleId, isAdditionalTime } = req.body;

      if (hours || minutes) {
        const currentExpiry = timeoutMap.get(`rule-${trafficRuleId}`)?.time;
        const originalTime = isAdditionalTime && currentExpiry ? Math.max(currentExpiry - Date.now(), 0) : null;
        const expiresAt = await startBonusRule(trafficRuleId, hours, minutes, unifiRequest, prisma, originalTime);

        const restartCallback = async () => {
          await endBonusRule(trafficRuleId, unifiRequest, prisma);
          endTimeout(`rule-${trafficRuleId}`);
        };
        startTimeout(`rule-${trafficRuleId}`, minutes, hours, restartCallback, originalTime);

        const remaining = expiresAt.getTime() - Date.now();
        res.status(200).json({ msg: 'Confirmed', timer: remaining, timerId: `rule-${trafficRuleId}` });
      } else {
        res.status(422).send({ message: 'Hours or minutes required for bonus time.' });
      }
    } catch (error) {
      const diag = await isDiagnosticsEnabled(prisma);
      res.status(400).json(diag ? { error: error.message } : { error: 'Invalid request.' });
      console.error(error);
    }
  });

  app.post('/getbonusrulesmap', async (req, res) => {
    try {
      const { trafficRuleId } = req.body;
      const t = timeoutMap.get(`rule-${trafficRuleId}`)?.time;
      if (t) {
        const newTime = t - Date.now();
        res.status(200).json({ timer: newTime });
      } else {
      // Restart-safe fallback: read the persisted expiry timestamp
        const rule = await prisma.trafficRules.findUnique({
          where: { id: trafficRuleId }
        });
        const expiresAt = rule?.bonusTimeExpiresAt;
        if (expiresAt) {
          const remaining = new Date(expiresAt).getTime() - Date.now();
          if (remaining > 0) {
            res.status(200).json({ timer: remaining });
          } else {
            res.status(204).json({ msg: 'No timer information for this rule.' });
          }
        } else {
          res.status(204).json({ msg: 'No timer information for this rule.' });
        }
      }
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/deletebonusrule', async (req, res) => { // cancel bonus time for a rule immediately
    const { trafficRuleId, cancelTimer } = req.body;
    try {
      if (cancelTimer) {
        endTimeout(`rule-${trafficRuleId}`);
      }
      await endBonusRule(trafficRuleId, unifiRequest, prisma);
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
    }
  });

  app.post('/addtrafficruleschedule', async (req, res) => { // create schedule for a traffic rule
    const { trafficRuleId, date, hour, minute, ampm, oneTime, modifiedDaysOfTheWeek, scheduleAction } = req.body;
    try {
      await addTrafficRuleSchedule(
        parseInt(trafficRuleId),
        { date, hour, minute, ampm, oneTime, modifiedDaysOfTheWeek, scheduleAction },
        unifiRequest,
        prisma
      );
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      await sendError(res, error);
    }
  });

  app.put('/toggletrafficruleschedule', async (req, res) => { // enable/disable an existing schedule
    const { scheduleId, toggleOn } = req.body;
    try {
      await toggleTrafficRuleSchedule(parseInt(scheduleId), unifiRequest, prisma, toggleOn === true);
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      await sendError(res, error);
    }
  });

  app.delete('/deletetrafficruleschedule', async (req, res) => { // remove a schedule entirely
    const { scheduleId } = req.body;
    try {
      await deleteTrafficRuleSchedule(parseInt(scheduleId), unifiRequest, prisma);
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      await sendError(res, error);
    }
  });

}

module.exports = { registertrafficrules };
