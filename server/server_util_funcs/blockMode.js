// blockMode.js — handles the three block modes for NUA devices.
//
// Each mode is a "resting state" for a device:
//   "full"       — association-level block (blockClient / unblockClient)
//   "internet"   — firewall policy LAN→WAN deny (device online, no internet)
//   "speedlimit" — qos-rule cap at a very low speed (device online, unusable)
//
// The rules/policies NUA creates are identified by name so they can be found
// and toggled later:
//   "NUA Internet Block: <device name>"  → firewall-policies store
//   "NUA Speed Limit: <device name>"     → qos-rules store
//
// applyBlock / clearBlock are the two entry points. jobFunction calls them
// based on the crontype ('block' / 'allow') and the device's blockMode.

const { FIREWALL_POLICIES_PATH, resolveZones } = require('./firewallPolicies');
const { QOS_RULES_PATH, buildQosRuleFromSpeedLimit } = require('./qosRules');

const NUA_INTERNET_BLOCK_PREFIX = 'NUA Internet Block: ';
const NUA_SPEED_LIMIT_PREFIX = 'NUA Speed Limit: ';
// 2 Kbps down / up — effectively unusable for any real content, but the
// device stays associated so the parent can see it's online.
const SLOW_SPEED_KBPS = 2;

// Get the device's name from the DB for use in the rule/policy name.
// Falls back to the MAC address if the device isn't in the DB yet.
async function getDeviceName(prisma, macAddress) {
  try {
    const device = await prisma.device.findUnique({ where: { macAddress } });
    return device?.name || macAddress;
  } catch (error) {
    console.error('blockMode: failed to look up device name:', error?.message || error);
    return macAddress;
  }
}

/**
 * Apply a block in the given mode.
 * @param {string} macAddress   the device's MAC address
 * @param {string} blockMode    "full" | "internet" | "speedlimit"
 * @param {object} unifi        the node-unifi client
 * @param {object} prisma       the Prisma client
 * @returns {Promise<boolean>}  true if the block was applied successfully
 */
async function applyBlock(macAddress, blockMode, unifi, prisma) {
  if (!unifi) {
    return false;
  }
  const deviceName = await getDeviceName(prisma, macAddress);
  switch (blockMode) {
  case 'internet':
    return toggleFirewallPolicy(macAddress, deviceName, NUA_INTERNET_BLOCK_PREFIX, true, unifi);
  case 'speedlimit':
    return toggleQosRule(macAddress, deviceName, NUA_SPEED_LIMIT_PREFIX, SLOW_SPEED_KBPS, true, unifi);
  case 'full':
  default:
    try {
      const result = await unifi.blockClient(macAddress);
      return !!(result && (Array.isArray(result) ? result.length > 0 : result));
    } catch (error) {
      console.error('blockMode applyBlock (full) failed:', error?.message || error);
      return false;
    }
  }
}

/**
 * Clear a block in the given mode (device becomes unrestricted).
 * @param {string} macAddress
 * @param {string} blockMode
 * @param {object} unifi
 * @param {object} prisma
 * @returns {Promise<boolean>}
 */
async function clearBlock(macAddress, blockMode, unifi, prisma) {
  if (!unifi) {
    return false;
  }
  const deviceName = await getDeviceName(prisma, macAddress);
  switch (blockMode) {
  case 'internet':
    return toggleFirewallPolicy(macAddress, deviceName, NUA_INTERNET_BLOCK_PREFIX, false, unifi);
  case 'speedlimit':
    return toggleQosRule(macAddress, deviceName, NUA_SPEED_LIMIT_PREFIX, SLOW_SPEED_KBPS, false, unifi);
  case 'full':
  default:
    try {
      const result = await unifi.unblockClient(macAddress);
      return !!(result && (Array.isArray(result) ? result.length > 0 : result));
    } catch (error) {
      console.error('blockMode clearBlock (full) failed:', error?.message || error);
      return false;
    }
  }
}

// Toggle a NUA-managed firewall policy by name.
// Creates it if it doesn't exist; toggles the `enabled` field if it does.
async function toggleFirewallPolicy(macAddress, deviceName, prefix, enabled, unifi) {
  const ruleName = prefix + deviceName;
  let policies;
  try {
    policies = await unifi.customApiRequest(FIREWALL_POLICIES_PATH, 'GET');
  } catch (error) {
    console.error('blockMode: failed to fetch firewall policies:', error?.message || error);
    return false;
  }

  const list = Array.isArray(policies) ? policies : [];
  const existing = list.find((p) => p.name === ruleName);

  if (existing) {
    try {
      await unifi.customApiRequest(FIREWALL_POLICIES_PATH, 'PUT', { ...existing, enabled });
      console.log(`blockMode: firewall policy "${ruleName}" set to ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      console.error('blockMode: failed to toggle firewall policy:', error?.message || error);
      return false;
    }
  }

  // Create a new internet-block policy.
  try {
    const zones = resolveZones(list);
    const policy = {
      name: ruleName,
      action: 'BLOCK',
      connection_state_type: 'ALL',
      connection_states: [],
      create_allow_respond: false,
      destination: {
        matching_target: 'ANY',
        port_matching_type: 'ANY',
        zone_id: zones.internetZone,
      },
      enabled,
      icmp_typename: 'ANY',
      icmp_v6_typename: 'ANY',
      ip_version: 'BOTH',
      logging: false,
      match_ip_sec: false,
      match_opposite_protocol: false,
      protocol: 'all',
      schedule: { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
      source: {
        matching_target: 'CLIENT',
        matching_target_type: 'SPECIFIC',
        client_macs: [String(macAddress).toLowerCase()],
        port_matching_type: 'ANY',
        zone_id: zones.lanZone || zones.internetZone,
      },
    };
    await unifi.customApiRequest(FIREWALL_POLICIES_PATH, 'POST', policy);
    console.log(`blockMode: created firewall policy "${ruleName}" (enabled: ${enabled})`);
    return true;
  } catch (error) {
    console.error('blockMode: failed to create firewall policy:', error?.message || error);
    return false;
  }
}

// Toggle a NUA-managed qos-rule by name.
// Creates it if it doesn't exist; toggles the `enabled` field if it does.
async function toggleQosRule(macAddress, deviceName, prefix, speedKbps, enabled, unifi) {
  const ruleName = prefix + deviceName;
  let rules;
  try {
    rules = await unifi.customApiRequest(QOS_RULES_PATH, 'GET');
  } catch (error) {
    console.error('blockMode: failed to fetch qos-rules:', error?.message || error);
    return false;
  }

  const list = Array.isArray(rules) ? rules : [];
  const existing = list.find((r) => r.name === ruleName);

  if (existing) {
    try {
      await unifi.customApiRequest(QOS_RULES_PATH, 'PUT', { ...existing, enabled });
      console.log(`blockMode: qos-rule "${ruleName}" set to ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      console.error('blockMode: failed to toggle qos-rule:', error?.message || error);
      return false;
    }
  }

  // Create a new speed-limit rule.
  try {
    const rule = buildQosRuleFromSpeedLimit({
      name: ruleName,
      clientMacs: [macAddress],
      downloadKbps: speedKbps,
      uploadKbps: speedKbps,
      enabled,
    });
    await unifi.customApiRequest(QOS_RULES_PATH, 'POST', rule);
    console.log(`blockMode: created qos-rule "${ruleName}" (enabled: ${enabled})`);
    return true;
  } catch (error) {
    console.error('blockMode: failed to create qos-rule:', error?.message || error);
    return false;
  }
}

module.exports = {
  applyBlock,
  clearBlock,
  NUA_INTERNET_BLOCK_PREFIX,
  NUA_SPEED_LIMIT_PREFIX,
  SLOW_SPEED_KBPS,
};
