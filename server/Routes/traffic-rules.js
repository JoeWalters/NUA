// traffic-rules routes for NUA server.
// Registered via registertrafficrules(app, ctx) from app.js.

// UniFi Network 11.x moved per-device speed limiting from the legacy
// `trafficrules` store (now 501) to the `qos-rules` store. This module is the
// translation shim so the existing UI/DB keep working (see module docs).
const {
  QOS_RULES_PATH,
  isQosRule,
  buildQosRuleFromSpeedLimit,
  qosRuleToLegacy,
} = require('../server_util_funcs/qosRules');

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

  // --- Graceful degradation for the removed per-device speed-limit feature ---
  //
  // NUA implemented per-device speed limits as UniFi *traffic rules* with
  // `bandwidth_limit.enabled`. UniFi Network 11.x no longer implements the
  // legacy traffic-rule bandwidth limit: POST/PUT/DELETE to
  // /v2/.../trafficrules now return 501 `api.err.NotImplemented`. Detect that
  // specific failure and return a clear, version-aware message (raw error only
  // when diagnostics are enabled) instead of a generic 500 or a leaked error
  // object.
  function isUnsupportedFeatureError(error) {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const message = error?.message || error?.response?.data?.message || '';
    return (
      status === 501 ||
      code === 'api.err.NotImplemented' ||
      /not\s+implemented/i.test(message)
    );
  }

  async function sendUnsupportedFeature(res, error) {
    console.error(error);
    const diag = await isDiagnosticsEnabled(prisma);
    return res.status(501).json({
      success: false,
      code: 'UNIFI_FEATURE_UNSUPPORTED',
      error:
        'Per-device speed limits are not supported by your UniFi controller. '
        + 'UniFi Network 11.x removed the legacy traffic-rule bandwidth limit that '
        + 'this feature depends on, so the rule could not be applied.',
      ...(diag ? { details: error?.message } : {}),
    });
  }

  app.get('/getdbcustomapirules', async (req, res) => { // get dbtrafficrules && unifi rules
    try {
      const path = '/v2/api/site/default/trafficrules';
      const result = await withUnifiRetry(() => getUnifi().customApiRequest(path, 'GET'));

      // UniFi Network 11.x stores per-device speed limits in the `qos-rules`
      // store (objective LIMIT_AND_PRIORITIZE), not the legacy `trafficrules`
      // store (now empty / 501). Fetch both and translate the qos-rules into the
      // legacy shape so the UI/DB (which speak the old shape) keep working. The
      // qos-rules fetch is best-effort: a controller hiccup or a firmware that
      // lacks the endpoint must not break the whole read.
      let qosRules = [];
      try {
        const qosList = await withUnifiRetry(() => getUnifi().customApiRequest(QOS_RULES_PATH, 'GET'));
        qosRules = (Array.isArray(qosList) ? qosList : []).map(qosRuleToLegacy).filter(Boolean);
      } catch (qosErr) {
        console.warn('qos-rules fetch failed in /getdbcustomapirules:', qosErr?.message || qosErr);
      }
      const unifiData = [...(Array.isArray(result) ? result : []), ...qosRules];

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
        return res.status(200).json({ trafficRuleDbData: joinedData, unifiData });
      }
      if (unifiData.length && !joinedData.length) {
        return res.status(206).json({ unifiData });
      }
      return res.status(200).json({ trafficRuleDbData: [], unifiData });
    } catch (error) {
      console.error('Error in /getdbcustomapirules:', error);
      if (isUnauthorizedUnifiError(error)) {
        return res.status(401).json({ error: 'UniFi authorization failed. Please verify credentials in /sitesettings.' });
      }
      return res.status(503).json({ error: 'Unable to fetch traffic rules from UniFi controller.' });
    }
  });

  // Reconcile NUA's local traffic-rule mirror with what actually exists on the
  // UniFi controller. A controller firmware upgrade that wipes traffic rules
  // (UniFi Network 11.x does this) leaves NUA's DB with "ghost" rows whose
  // unifiId no longer exists on the controller. Prune those so the UI stops
  // showing phantom rules. Safe by construction: a failed controller read
  // (unreachable / 401) aborts WITHOUT deleting anything -- we only prune when a
  // live fetch SUCCEEDS and a rule is provably absent from it.
  app.post('/reconciletrafficrules', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const dryRun = req.body?.dryRun === true;
    try {
      const live = await withUnifiRetry(() => getUnifi().customApiRequest('/v2/api/site/default/trafficrules', 'GET'));
      const liveIds = new Set((Array.isArray(live) ? live : []).map((r) => r._id).filter(Boolean));

      const dbRules = await prisma.trafficRules.findMany();
      const ghosts = dbRules.filter((rule) => !liveIds.has(rule.unifiId));

      if (dryRun) {
        return res.status(200).json({
          success: true,
          dryRun: true,
          pruned: 0,
          wouldPrune: ghosts.map((r) => ({ id: r.id, unifiId: r.unifiId, description: r.description })),
        });
      }

      let pruned = 0;
      const removed = [];
      for (const ghost of ghosts) {
        await prisma.$transaction(async (trule) => {
          await trule.appCatIds.deleteMany({ where: { trafficRulesId: ghost.id } });
          await trule.appIds.deleteMany({ where: { trafficRulesId: ghost.id } });
          await trule.targetDevice.deleteMany({ where: { trafficRulesId: ghost.id } });
          await trule.trafficRuleDevices.deleteMany({ where: { trafficRulesId: ghost.id } });
          await trule.trafficRuleSchedule.deleteMany({ where: { trafficRulesId: ghost.id } });
          await trule.trafficRules.delete({ where: { id: ghost.id } });
        });
        pruned += 1;
        removed.push({ id: ghost.id, unifiId: ghost.unifiId, description: ghost.description });
        console.log(`Reconciled (pruned ghost) traffic rule id=${ghost.id} unifiId=${ghost.unifiId} desc="${ghost.description}"`);
      }
      res.status(200).json({ success: true, dryRun: false, pruned, removed });
    } catch (error) {
      console.error('Error in /reconciletrafficrules:', error);
      if (isUnauthorizedUnifiError(error)) {
        return res.status(401).json({ error: 'UniFi authorization failed. Please verify credentials in /sitesettings.' });
      }
      return res.status(503).json({ error: 'Unable to reconcile traffic rules with the UniFi controller.' });
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
      if (isUnsupportedFeatureError(error)) {
        return await sendUnsupportedFeature(res, error);
      }
      console.error(error);
      await sendError(res, error);
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
      if (isUnsupportedFeatureError(error)) {
        return await sendUnsupportedFeature(res, error);
      }
      console.error(error);
      await sendError(res, error);
    }
  });

  app.post('/addspeedlimittrafficrule', async (req, res) => {
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { description, enabled, devices } = req.body;

    try {
      // UniFi Network 11.x caps a device via a QoS "Limit" rule (the qos-rules
      // store, objective LIMIT_AND_PRIORITIZE), addressed by the device MAC as
      // the rule's SOURCE — no destination IP/ID is needed (unlike the old
      // IP-based trafficrules, which are now 501). So target the selected
      // devices by MAC directly; an offline device is fine (the cap applies when
      // it next connects).
      const clientMacs = (devices || [])
        .map((d) => d.macAddress)
        .filter((m) => typeof m === 'string' && m.trim());

      if (!clientMacs.length) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No device with a MAC address was selected for this speed limit.',
          },
        });
      }

      const qosRule = buildQosRuleFromSpeedLimit({
        name: description || 'Speed limit rule',
        clientMacs,
        downloadKbps: req.body.downloadKbps,
        uploadKbps: req.body.uploadKbps,
        enabled: enabled,
      });

      const result = await getUnifi().customApiRequest(QOS_RULES_PATH, 'POST', qosRule);

      const setTrafficRuleEntry = await prisma.trafficRules.create({
        data: {
          unifiId: result._id,
          description: description,
          enabled: enabled,
          blockAllow: 'ALLOW',
        },
      });

      for (const device of (devices || [])) {
        if (!device.macAddress) {
          continue;
        }
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

      res.status(200).json({ success: true, result: result, skipped: [] });
    } catch (error) {
      if (isUnsupportedFeatureError(error)) {
        return await sendUnsupportedFeature(res, error);
      }
      console.error(error);
      await sendError(res, error);
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
      // QoS "Limit" rules (UniFi 11.x) live in the qos-rules store. Toggle them
      // there: fetch the live object, flip enabled, and PUT the whole thing back
      // (PATCH is 405 and the controller validates by object bind, so a full
      // -object PUT is required).
      if (isQosRule(unifiObjCopy)) {
        const qosList = await getUnifi().customApiRequest(QOS_RULES_PATH, 'GET');
        const current = (Array.isArray(qosList) ? qosList : []).find((r) => r._id === _id);
        if (!current) {
          return res.status(404).json({ error: `QoS rule ${_id} not found on the controller` });
        }
        current.enabled = unifiObjCopy.enabled;
        const result = await getUnifi().customApiRequest(`${QOS_RULES_PATH}/${_id}`, 'PUT', current);
        console.log('qos toggle result \t', result);

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
        return;
      }

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
      if (isUnsupportedFeatureError(error)) {
        return await sendUnsupportedFeature(res, error);
      }
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
      let result;
      // QoS "Limit" rules (UniFi 11.x) live in the qos-rules store; block/allow
      // rules live in trafficrules. Route by shape so both keep working.
      if (isQosRule(unifiRule)) {
        const qosList = await getUnifi().customApiRequest(QOS_RULES_PATH, 'GET');
        const current = (Array.isArray(qosList) ? qosList : []).find((r) => r._id === unifiRule._id);
        if (!current) {
          return res.status(404).json({ error: `QoS rule ${unifiRule._id} not found on the controller` });
        }
        // The controller validates by object bind (PATCH is 405), so mutate the
        // LIVE object with the edits and PUT it whole.
        current.name = description || unifiRule.name || current.name;
        const limits = unifiRule.bandwidth_limit;
        if (limits) {
          if (typeof limits.download_limit_kbps === 'number') {
            current.download_limit_kbps = limits.download_limit_kbps;
          }
          if (typeof limits.upload_limit_kbps === 'number') {
            current.upload_limit_kbps = limits.upload_limit_kbps;
          }
        }
        const nextDevices = targetDevices.length ? targetDevices : (unifiRule.target_devices || []);
        if (nextDevices.length && current.source) {
          current.source.client_macs = nextDevices
            .map((d) => d.client_mac || d.macAddress)
            .filter(Boolean)
            .map((m) => String(m).toLowerCase());
        }
        result = await getUnifi().customApiRequest(`${QOS_RULES_PATH}/${unifiRule._id}`, 'PUT', current);
      } else {
        const path = `/v2/api/site/default/trafficrules/${unifiRule._id}`;
        result = await getUnifi().customApiRequest(path, 'PUT', unifiRule);
      }

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
      if (isUnsupportedFeatureError(error)) {
        return await sendUnsupportedFeature(res, error);
      }
      console.error(error);
      await sendError(res, error);
    }
  });

  app.delete('/deletecustomapi', async (req, res) => { // deletes unifi rule, not db (yet)
    if (!getUnifi()) {
      return res.status(503).json({ error: 'UniFi controller not connected. Please configure credentials at /sitesettings' });
    }
    const { _id, trafficRuleId } = req.body;
    console.log('id of rule to delete \t', _id);
    console.log('trafficRuleId \t', trafficRuleId);
    try {
      // A per-device speed limit lives in the qos-rules store on UniFi 11.x;
      // block/allow rules live in the legacy trafficrules store. The two _id
      // spaces are disjoint, so check qos-rules first, then trafficrules, and
      // delete from whichever holds the rule.
      let checkFilter = [];
      const qosList = await getUnifi().customApiRequest(QOS_RULES_PATH, 'GET');
      const qosMatch = (Array.isArray(qosList) ? qosList : []).filter((rule) => rule._id === _id);
      if (qosMatch.length) {
        const result = await getUnifi().customApiRequest(`${QOS_RULES_PATH}/${_id}`, 'DELETE', null);
        console.log('qos "DELETE" result: \t', result);
        checkFilter = qosMatch;
      } else {
        const checkForExistingUnifiRule = await getUnifi().customApiRequest('/v2/api/site/default/trafficrules', 'GET');
        checkFilter = checkForExistingUnifiRule.filter((rule) => {
          return rule._id === _id;
        });
        if (checkFilter.length) {
          const path = `/v2/api/site/default/trafficrules/${_id}`;
          const result = await getUnifi().customApiRequest(path, 'DELETE', null);
          console.log('"DELETE" result: \t', result);
        }
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
