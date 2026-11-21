// qosRules.js — shim for UniFi Network 11.x per-device speed limiting.
//
// UniFi Network 11.x MOVED per-device speed limiting out of the legacy
// `trafficrules` store (whose POST now returns 501 api.err.NotImplemented) into
// a separate `qos-rules` store, where a per-device cap is a rule with
// objective "LIMIT_AND_PRIORITIZE" (the UI's "Limit"). NUA's DB and frontend
// still speak the old traffic-rule shape (bandwidth_limit / target_devices /
// matching_target / action / description), so this module is the translation
// layer that lets the existing UI and DB keep working untouched:
//
//   buildQosRuleFromSpeedLimit()  NUA create input  -> qos-rule object (POST)
//   qosRuleToLegacy()             qos-rule object   -> old shape (read/import)
//   isQosRule()                   detect a qos-rule (or mixed) object
//
// For toggle/update, the handler fetches the live qos-rule, mutates it, and PUTs
// the whole object back (the controller validates by object bind and PATCH is
// 405, so a full-object PUT is required). The legacy fields are preserved on the
// translated object so the UI can send a mixed object back on toggle.

const QOS_RULES_PATH = '/v2/api/site/default/qos-rules';

// The legacy block/allow-rule store. On UniFi Network 11.x its POST/PUT return
// 501, but GET still returns the (now empty) list, so the lookup below is safe.
const LEGACY_TRAFFICRULES_PATH = '/v2/api/site/default/trafficrules';

// The UI's "Limit" objective is LIMIT_AND_PRIORITIZE in the API.
const QOS_OBJECTIVE_LIMIT = 'LIMIT_AND_PRIORITIZE';

/**
 * True if `obj` is a QoS rule (has an `objective`), including a "mixed" object
 * that still carries the legacy fields. Used to route toggle/update/delete to
 * the qos-rules store instead of the now-dead trafficrules store.
 */
function isQosRule(obj) {
  return !!obj && typeof obj === 'object' && obj.objective !== undefined;
}

/**
 * Build a QoS "Limit" rule from a NUA speed-limit create request.
 * @param {object} input
 * @param {string} [input.name]        rule name (description in the old shape)
 * @param {string[]} input.clientMacs  source client MACs (device MACs)
 * @param {number} input.downloadKbps  download cap in kbps
 * @param {number} input.uploadKbps    upload cap in kbps
 * @param {boolean} [input.enabled]    rule enabled state
 * @param {object} [input.schedule]    schedule (defaults to ALWAYS / all day)
 * @returns {object} a qos-rule object ready for POST to QOS_RULES_PATH
 */
function buildQosRuleFromSpeedLimit({ name, clientMacs, downloadKbps, uploadKbps, enabled = true, schedule } = {}) {
  return {
    name: name || 'Speed limit rule',
    // Per-device cap: the device(s) are the SOURCE; cap all DESTINATIONS.
    source: {
      matching_target: 'CLIENT',
      client_macs: (clientMacs || []).map((m) => String(m).toLowerCase()),
    },
    destination: {
      matching_target: 'ANY',
      port_matching_type: 'ANY',
    },
    objective: QOS_OBJECTIVE_LIMIT,
    download_limit_kbps: Number(downloadKbps),
    upload_limit_kbps: Number(uploadKbps),
    download_burst: 'OFF',
    upload_burst: 'OFF',
    enabled: !!enabled,
    // `index` is assigned by the controller on create, so it is omitted here.
    schedule: schedule || { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
  };
}

/**
 * Translate a qos-rule (as returned by the controller) into the legacy
 * traffic-rule shape the UI/DB expect. The native qos fields are spread in too,
 * so a "mixed" object sent back by the UI on toggle can be routed back to the
 * qos-rules store. `description`/`name`, `action`, `matching_target`,
 * `target_devices`, and `bandwidth_limit` are the fields the frontend reads.
 * @param {object} q a qos-rule object
 * @returns {object|null} the legacy-shaped rule, or null if `q` is unusable
 */
function qosRuleToLegacy(q) {
  if (!q || !q._id) {
    return null;
  }
  const clientMacs = (q.source && q.source.client_macs) || [];
  return {
    ...q, // keep native fields (source/destination/objective/index/burst) for PUT
    _id: q._id,
    description: q.name,
    action: 'ALLOW',
    matching_target: (q.destination && q.destination.matching_target) || 'ANY',
    target_devices: clientMacs.map((mac) => ({ client_mac: mac, type: 'CLIENT' })),
    bandwidth_limit: {
      download_limit_kbps: q.download_limit_kbps,
      upload_limit_kbps: q.upload_limit_kbps,
      enabled: q.enabled,
    },
  };
}

/**
 * Find a rule by `unifiId` across both stores and return the live object plus
 * the base path to PUT it back to. QoS "Limit" rules (UniFi 11.x) live in the
 * `qos-rules` store; legacy block/allow rules live in `trafficrules`. The two
 * `_id` spaces are disjoint, so we try `qos-rules` first and fall back to
 * `trafficrules`. A hiccup on one store (network blip, 401, a firmware that
 * lacks the endpoint) must not abort trying the other, so each GET is
 * best-effort. Returns `{ rule, store }` or null.
 *
 * The schedulers (schedule + bonus time) use this so a scheduled/bonus speed
 * limit toggles its QoS rule in the `qos-rules` store instead of the now-dead
 * `trafficrules` store.
 * @param {Function} unifiRequest wrapped request fn (path, method, body)
 * @param {string} unifiId the rule's controller _id
 * @returns {Promise<{rule: object, store: string}|null>}
 */
async function resolveRuleForUpdate(unifiRequest, unifiId) {
  for (const store of [QOS_RULES_PATH, LEGACY_TRAFFICRULES_PATH]) {
    let list;
    try {
      list = await unifiRequest(store, 'GET');
    } catch (error) {
      // One store failing (blip / 401 / unsupported) must not prevent the other.
      continue;
    }
    if (Array.isArray(list)) {
      const rule = list.find((r) => r._id === unifiId);
      if (rule) {
        return { rule, store };
      }
    }
  }
  return null;
}

module.exports = {
  QOS_RULES_PATH,
  LEGACY_TRAFFICRULES_PATH,
  QOS_OBJECTIVE_LIMIT,
  isQosRule,
  buildQosRuleFromSpeedLimit,
  qosRuleToLegacy,
  resolveRuleForUpdate,
};
