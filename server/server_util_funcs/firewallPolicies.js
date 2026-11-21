// firewallPolicies.js — shim for UniFi Network 11.x block/allow rules.
//
// UniFi Network 11.x moved per-device/category/app BLOCK/ALLOW rules out of the
// legacy `trafficrules` store (whose POST now returns 501) into the
// `firewall-policies` store, whose schema is quite different (a `source` and a
// `destination`, each with a `zone_id`, plus `action`/`protocol`/`ip_version`/
// `schedule`/connection fields). NUA's DB and frontend still speak the old
// flat traffic-rule shape (`action` + `matching_target` + `target_devices` +
// `app_ids`/`app_category_ids` + `bandwidth_limit`), so this module is the
// translation layer, mirroring qosRules.js for the speed-limit re-map:
//
//   buildFirewallPolicyFromLegacy()  NUA legacy object -> firewall-policy (POST/PUT)
//   firewallPolicyToLegacy()         firewall-policy   -> legacy shape (read/import)
//   isFirewallPolicy()               detect a firewall-policy (or mixed) object
//   resolveZones()                   derive the LAN + Internet zone ids from a list
//
// The legacy `matching_target` is the rule's DESTINATION type; the source comes
// from `target_devices` (CLIENT macs or NETWORK ids). A firewall-policy needs a
// `zone_id` on both source and destination; those are site-specific, so we
// derive them from the controller's own policy list rather than hard-coding.

const FIREWALL_POLICIES_PATH = '/v2/api/site/default/firewall-policies';

/**
 * True if `obj` is a firewall-policy (or a "mixed" object the UI sent back that
 * still carries the native fields). Firewall-policies have an `action` plus
 * `source`/`destination` objects and NO `objective` (that marks a QoS rule).
 */
function isFirewallPolicy(obj) {
  return !!(
    obj
    && typeof obj === 'object'
    && typeof obj.action === 'string'
    && obj.source && typeof obj.source === 'object'
    && obj.destination && typeof obj.destination === 'object'
    && obj.objective === undefined
  );
}

/**
 * Derive the LAN (source) and Internet (destination) zone ids from the
 * controller's policy list. These are site-specific and required on every
 * firewall-policy (source.zone_id and destination.zone_id are NotNull), so we
 * read them from existing policies instead of hard-coding. The 70 predefined
 * "Allow All Traffic"/"Block All Traffic" rules always exist, so this resolves
 * even on a fresh site.
 * @param {object[]} policies the firewall-policies list
 * @returns {{lanZone: string|null, internetZone: string|null}}
 */
function resolveZones(policies) {
  const list = Array.isArray(policies) ? policies : [];
  let lanZone = null;
  let internetZone = null;

  // Internet/WAN zone: the destination of a predefined "Allow All Traffic" rule
  // (every network's allow-all points its destination at the Internet zone).
  for (const p of list) {
    if (p && p.predefined && p.name === 'Allow All Traffic' && p.destination?.zone_id) {
      internetZone = p.destination.zone_id;
      break;
    }
  }
  // LAN/source zone: the source zone of any CLIENT/NETWORK-sourced rule.
  for (const p of list) {
    const s = p && p.source;
    if (s && (s.matching_target === 'CLIENT' || s.matching_target === 'NETWORK') && s.zone_id) {
      lanZone = s.zone_id;
      break;
    }
  }
  // Fallbacks so a create never silently omits a required zone_id.
  if (!internetZone) {
    const counts = {};
    for (const p of list) {
      const z = p && p.destination && p.destination.zone_id;
      if (z) {
        counts[z] = (counts[z] || 0) + 1;
      }
    }
    internetZone = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  if (!lanZone) {
    lanZone = internetZone;
  }
  return { lanZone, internetZone };
}

// Build the rule SOURCE from the legacy target_devices / network_ids.
function buildSource(legacy, zones) {
  const targetDevices = legacy.target_devices || [];
  const clients = targetDevices.filter((d) => d?.client_mac).map((d) => d.client_mac);
  const networks = [
    ...targetDevices.filter((d) => d?.network_id).map((d) => d.network_id),
    ...(legacy.network_ids || []),
  ];
  const zoneId = zones.lanZone || zones.internetZone;
  if (clients.length) {
    return {
      matching_target: 'CLIENT',
      matching_target_type: 'SPECIFIC',
      client_macs: clients.map((m) => String(m).toLowerCase()),
      port_matching_type: 'ANY',
      zone_id: zoneId,
    };
  }
  if (networks.length) {
    return {
      matching_target: 'NETWORK',
      network_ids: networks,
      port_matching_type: 'ANY',
      zone_id: zoneId,
    };
  }
  return {
    matching_target: 'ANY',
    port_matching_type: 'ANY',
    zone_id: zoneId,
  };
}

// Build the rule DESTINATION from the legacy matching_target + app ids.
function buildDestination(legacy, zones) {
  const zoneId = zones.internetZone || zones.lanZone;
  const appIds = legacy.app_ids || [];
  const appCatIds = (legacy.app_category_ids || []).map((id) =>
    (id && typeof id === 'object') ? (id.app_cat_id || id.categoryId) : id).filter(Boolean);
  const target = legacy.matching_target;
  if (target === 'APP_CATEGORY' || appCatIds.length) {
    return { matching_target: 'APP_CATEGORY', app_category_ids: appCatIds, port_matching_type: 'ANY', zone_id: zoneId };
  }
  if (target === 'APP' || appIds.length) {
    return { matching_target: 'APP', app_ids: appIds, port_matching_type: 'ANY', zone_id: zoneId };
  }
  // INTERNET / any / nothing specific -> match all destinations (block or allow
  // all Internet traffic for the source).
  return { matching_target: 'ANY', port_matching_type: 'ANY', zone_id: zoneId };
}

/**
 * Build a firewall-policy from a NUA legacy traffic-rule object. Omit `_id` and
 * `index` (the controller assigns them on create). The connection/icmp fields
 * use the safe defaults the controller's own rules use.
 * @param {object} legacy the legacy traffic-rule object
 * @param {{lanZone: string|null, internetZone: string|null}} zones resolved zone ids
 * @returns {object} a firewall-policy object ready for POST/PUT
 */
function buildFirewallPolicyFromLegacy(legacy, zones) {
  const enabled = legacy.enabled !== undefined ? !!legacy.enabled : true;
  return {
    name: legacy.description || legacy.name || 'Traffic rule',
    action: legacy.action || 'BLOCK',
    connection_state_type: 'ALL',
    connection_states: [],
    create_allow_respond: false,
    destination: buildDestination(legacy, zones),
    enabled,
    icmp_typename: 'ANY',
    icmp_v6_typename: 'ANY',
    ip_version: 'BOTH',
    logging: false,
    match_ip_sec: false,
    match_opposite_protocol: false,
    protocol: 'all',
    schedule: legacy.schedule || { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
    source: buildSource(legacy, zones),
  };
}

/**
 * Translate a firewall-policy (as returned by the controller) into the legacy
 * flat shape the UI/DB expect. The native fields (source/destination/action/
 * zone_id) are spread in so a toggle/update can route back to the firewall
 * store by shape. `bandwidth_limit.enabled` is false — block/allow rules are not
 * speed limits, so the UI won't mistake them for QoS rules.
 * @param {object} p a firewall-policy object
 * @returns {object|null} the legacy-shaped rule, or null if `p` is unusable
 */
function firewallPolicyToLegacy(p) {
  if (!p || !p._id) {
    return null;
  }
  const source = p.source || {};
  const dest = p.destination || {};
  const targetDevices = [];
  if (source.matching_target === 'CLIENT') {
    for (const mac of source.client_macs || []) {
      targetDevices.push({ client_mac: mac, type: 'CLIENT' });
    }
  } else if (source.matching_target === 'NETWORK') {
    for (const nid of source.network_ids || []) {
      targetDevices.push({ network_id: nid, type: 'NETWORK' });
    }
  }
  // The legacy matching_target is the destination type; map 'ANY' back to the
  // 'INTERNET' the UI uses for "all Internet traffic".
  let matchingTarget = dest.matching_target || 'ANY';
  if (matchingTarget === 'ANY') {
    matchingTarget = 'INTERNET';
  }
  return {
    ...p, // keep native fields (source/destination/action/zone) for PUT
    _id: p._id,
    description: p.name,
    action: p.action,
    matching_target: matchingTarget,
    app_ids: dest.app_ids || [],
    app_category_ids: dest.app_category_ids || [],
    target_devices: targetDevices,
    enabled: p.enabled,
    schedule: p.schedule || { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
    // Not a speed limit.
    bandwidth_limit: { enabled: false, download_limit_kbps: 0, upload_limit_kbps: 0 },
  };
}

module.exports = {
  FIREWALL_POLICIES_PATH,
  isFirewallPolicy,
  resolveZones,
  buildFirewallPolicyFromLegacy,
  firewallPolicyToLegacy,
};
