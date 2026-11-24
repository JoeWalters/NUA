const { test } = require('node:test');
const assert = require('node:assert');

const {
  FIREWALL_POLICIES_PATH,
  isFirewallPolicy,
  resolveZones,
  buildFirewallPolicyFromLegacy,
  firewallPolicyToLegacy,
} = require('../server_util_funcs/firewallPolicies');

const LAN = 'd2306a3e-320f-4d3c-bc13-24dae4629062';
const INET = '00973525-0fa5-48ef-82e8-7b1cd8122138';

// ---------------------------------------------------------------------------
// isFirewallPolicy — distinguish a firewall-policy from a QoS rule / legacy rule
// ---------------------------------------------------------------------------

test('isFirewallPolicy: true for a firewall-policy shape', () => {
  assert.strictEqual(isFirewallPolicy({
    action: 'BLOCK',
    source: { matching_target: 'CLIENT' },
    destination: { matching_target: 'APP' },
  }), true);
});

test('isFirewallPolicy: false for a QoS rule (has objective)', () => {
  assert.strictEqual(isFirewallPolicy({
    objective: 'LIMIT_AND_PRIORITIZE',
    source: { matching_target: 'CLIENT' },
    destination: { matching_target: 'ANY' },
  }), false);
});

test('isFirewallPolicy: false for a legacy trafficrule (no source/destination)', () => {
  assert.strictEqual(isFirewallPolicy({
    action: 'BLOCK',
    matching_target: 'APP',
    target_devices: [{ client_mac: 'aa:bb:cc:dd:ee:ff', type: 'CLIENT' }],
    bandwidth_limit: { enabled: false },
  }), false);
});

// ---------------------------------------------------------------------------
// resolveZones — derive the LAN + Internet zone ids from a policy list
// ---------------------------------------------------------------------------

test('resolveZones: derives LAN from a CLIENT source and Internet from Allow All', () => {
  const policies = [
    { predefined: true, name: 'Allow All Traffic', source: { zone_id: LAN }, destination: { zone_id: INET } },
    { name: 'Block YouTube', source: { matching_target: 'CLIENT', zone_id: LAN }, destination: { zone_id: INET } },
  ];
  const { lanZone, internetZone } = resolveZones(policies);
  assert.strictEqual(lanZone, LAN);
  assert.strictEqual(internetZone, INET);
});

test('resolveZones: tolerates an empty list (nulls, never throws)', () => {
  const { lanZone, internetZone } = resolveZones([]);
  assert.strictEqual(lanZone, null);
  assert.strictEqual(internetZone, null);
});

// ---------------------------------------------------------------------------
// buildFirewallPolicyFromLegacy — the create/PUT translation
// ---------------------------------------------------------------------------

test('buildFirewallPolicyFromLegacy: CLIENT source + APP destination', () => {
  const legacy = {
    description: 'Block YouTube',
    action: 'BLOCK',
    matching_target: 'APP',
    app_ids: [262256],
    target_devices: [{ client_mac: 'AA:BB:CC:DD:EE:FF', type: 'CLIENT' }],
    enabled: false,
  };
  const policy = buildFirewallPolicyFromLegacy(legacy, { lanZone: LAN, internetZone: INET });

  assert.strictEqual(policy.name, 'Block YouTube');
  assert.strictEqual(policy.action, 'BLOCK');
  assert.strictEqual(policy.enabled, false);
  assert.strictEqual(policy.ip_version, 'BOTH');
  assert.strictEqual(policy.protocol, 'all');
  assert.strictEqual(policy.create_allow_respond, false);
  assert.deepStrictEqual(policy.source, {
    matching_target: 'CLIENT',
    matching_target_type: 'SPECIFIC',
    client_macs: ['aa:bb:cc:dd:ee:ff'],
    port_matching_type: 'ANY',
    zone_id: LAN,
  });
  assert.deepStrictEqual(policy.destination, {
    matching_target: 'APP',
    app_ids: [262256],
    port_matching_type: 'ANY',
    zone_id: INET,
  });
  // Controller-assigned fields are omitted on create.
  assert.strictEqual(policy._id, undefined);
  assert.strictEqual(policy.index, undefined);
});

test('buildFirewallPolicyFromLegacy: APP_CATEGORY destination from db-shaped ids', () => {
  const legacy = {
    description: 'Block category',
    action: 'BLOCK',
    matching_target: 'APP_CATEGORY',
    app_category_ids: [{ app_cat_id: 3, categoryName: 'Social' }],
    target_devices: [{ client_mac: 'AA:BB:CC:DD:EE:FF', type: 'CLIENT' }],
    enabled: true,
  };
  const policy = buildFirewallPolicyFromLegacy(legacy, { lanZone: LAN, internetZone: INET });
  assert.strictEqual(policy.destination.matching_target, 'APP_CATEGORY');
  assert.deepStrictEqual(policy.destination.app_category_ids, [3]);
  assert.strictEqual(policy.enabled, true);
});

test('buildFirewallPolicyFromLegacy: NETWORK source', () => {
  const legacy = {
    description: 'Block on network',
    action: 'BLOCK',
    matching_target: 'ANY',
    target_devices: [{ network_id: '63c9eee5bf79960e3813bb10', type: 'NETWORK' }],
    enabled: true,
  };
  const policy = buildFirewallPolicyFromLegacy(legacy, { lanZone: LAN, internetZone: INET });
  assert.strictEqual(policy.source.matching_target, 'NETWORK');
  assert.deepStrictEqual(policy.source.network_ids, ['63c9eee5bf79960e3813bb10']);
  // No app/app-category -> destination is ANY (all Internet traffic).
  assert.strictEqual(policy.destination.matching_target, 'ANY');
});

// ---------------------------------------------------------------------------
// firewallPolicyToLegacy — the read/import translation
// ---------------------------------------------------------------------------

test('firewallPolicyToLegacy: maps destination matching_target ANY -> INTERNET', () => {
  const p = {
    _id: 'fw-1',
    name: 'Block all for phone',
    action: 'BLOCK',
    enabled: false,
    source: { matching_target: 'CLIENT', client_macs: ['aa:bb:cc:dd:ee:ff'], zone_id: LAN },
    destination: { matching_target: 'ANY', zone_id: INET },
    schedule: { mode: 'ALWAYS' },
  };
  const legacy = firewallPolicyToLegacy(p);
  assert.strictEqual(legacy.description, 'Block all for phone');
  assert.strictEqual(legacy.action, 'BLOCK');
  assert.strictEqual(legacy.matching_target, 'INTERNET');
  assert.deepStrictEqual(legacy.target_devices, [{ client_mac: 'aa:bb:cc:dd:ee:ff', type: 'CLIENT' }]);
  assert.strictEqual(legacy.bandwidth_limit.enabled, false, 'block/allow is not a speed limit');
  // Native fields survive so a toggle can route back to the firewall store.
  assert.strictEqual(isFirewallPolicy(legacy), true);
});

test('firewallPolicyToLegacy: NETWORK source -> network target devices', () => {
  const p = {
    _id: 'fw-2',
    name: 'Block on kids net',
    action: 'BLOCK',
    enabled: true,
    source: { matching_target: 'NETWORK', network_ids: ['63c9eee5bf79960e3813bb10'], zone_id: LAN },
    destination: { matching_target: 'APP', app_ids: [262256], zone_id: INET },
  };
  const legacy = firewallPolicyToLegacy(p);
  assert.deepStrictEqual(legacy.target_devices, [{ network_id: '63c9eee5bf79960e3813bb10', type: 'NETWORK' }]);
  assert.deepStrictEqual(legacy.app_ids, [262256]);
  assert.strictEqual(legacy.matching_target, 'APP');
});
