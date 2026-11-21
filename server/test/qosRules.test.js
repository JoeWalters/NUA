const { test } = require('node:test');
const assert = require('node:assert');

const {
  QOS_RULES_PATH,
  LEGACY_TRAFFICRULES_PATH,
  resolveRuleForUpdate,
  buildQosRuleFromSpeedLimit,
  qosRuleToLegacy,
  isQosRule,
} = require('../server_util_funcs/qosRules');

// A fake wrapped request fn that returns a different list per store and records
// the (path, method) of every call, so the tests can assert which store a rule
// was found in (and therefore which store a subsequent PUT would target).
function makeRequest({ qos = [], traffic = [] } = {}) {
  const calls = [];
  const unifiRequest = async (path, method) => {
    calls.push({ path, method });
    if (path === QOS_RULES_PATH) {
      return qos;
    }
    if (path === LEGACY_TRAFFICRULES_PATH) {
      return traffic;
    }
    return [];
  };
  return { unifiRequest, calls };
}

// ---------------------------------------------------------------------------
// resolveRuleForUpdate — the dual-store lookup the schedulers use
// ---------------------------------------------------------------------------

test('resolveRuleForUpdate: finds a QoS rule in the qos-rules store', async () => {
  const qosRule = { _id: 'qos-1', objective: 'LIMIT_AND_PRIORITIZE', enabled: false };
  const { unifiRequest, calls } = makeRequest({ qos: [qosRule], traffic: [] });

  const resolved = await resolveRuleForUpdate(unifiRequest, 'qos-1');

  assert.ok(resolved, 'expected a match');
  assert.strictEqual(resolved.store, QOS_RULES_PATH, 'should route to qos-rules');
  assert.strictEqual(resolved.rule, qosRule);
  // qos-rules is checked first and matched, so trafficrules is never queried.
  assert.strictEqual(calls.filter((c) => c.path === LEGACY_TRAFFICRULES_PATH).length, 0);
});

test('resolveRuleForUpdate: falls back to the legacy trafficrules store', async () => {
  const legacyRule = { _id: 'legacy-1', action: 'ALLOW', enabled: true };
  const { unifiRequest, calls } = makeRequest({ qos: [], traffic: [legacyRule] });

  const resolved = await resolveRuleForUpdate(unifiRequest, 'legacy-1');

  assert.ok(resolved, 'expected a match in the fallback store');
  assert.strictEqual(resolved.store, LEGACY_TRAFFICRULES_PATH, 'should route to trafficrules');
  assert.strictEqual(resolved.rule, legacyRule);
  // Both stores were queried (qos-rules first, then the fallback).
  assert.strictEqual(calls.length, 2);
});

test('resolveRuleForUpdate: returns null when the rule is in neither store', async () => {
  const { unifiRequest } = makeRequest({ qos: [], traffic: [] });
  const resolved = await resolveRuleForUpdate(unifiRequest, 'ghost');
  assert.strictEqual(resolved, null);
});

test('resolveRuleForUpdate: a failing store does not abort the other', async () => {
  // qos-rules GET throws (e.g. a blip or a firmware without the endpoint); the
  // legacy rule must still be found in trafficrules.
  const legacyRule = { _id: 'legacy-2', action: 'BLOCK', enabled: false };
  const calls = [];
  const unifiRequest = async (path, method) => {
    calls.push(path);
    if (path === QOS_RULES_PATH) {
      throw new Error('qos-rules unavailable');
    }
    return path === LEGACY_TRAFFICRULES_PATH ? [legacyRule] : [];
  };

  const resolved = await resolveRuleForUpdate(unifiRequest, 'legacy-2');

  assert.ok(resolved, 'fallback should still find the rule despite the first store throwing');
  assert.strictEqual(resolved.store, LEGACY_TRAFFICRULES_PATH);
  assert.strictEqual(resolved.rule, legacyRule);
});

// ---------------------------------------------------------------------------
// shape helpers used by the re-map
// ---------------------------------------------------------------------------

test('buildQosRuleFromSpeedLimit: produces a QoS "Limit" rule (MAC source, ANY dest)', () => {
  const rule = buildQosRuleFromSpeedLimit({
    name: 'Cap the laptop',
    clientMacs: ['AA:BB:CC:DD:EE:FF'],
    downloadKbps: 2048,
    uploadKbps: 1024,
    enabled: true,
  });
  assert.strictEqual(rule.objective, 'LIMIT_AND_PRIORITIZE');
  assert.strictEqual(rule.source.matching_target, 'CLIENT');
  assert.deepStrictEqual(rule.source.client_macs, ['aa:bb:cc:dd:ee:ff']);
  assert.strictEqual(rule.destination.matching_target, 'ANY');
  assert.strictEqual(rule.download_limit_kbps, 2048);
  assert.strictEqual(rule.upload_limit_kbps, 1024);
  assert.strictEqual(rule.enabled, true);
  // index is assigned by the controller on create, so it must not be present.
  assert.strictEqual(rule.index, undefined);
});

test('qosRuleToLegacy + isQosRule: round-trip keeps the native fields for PUT', () => {
  const q = {
    _id: 'qos-9',
    name: 'Cap the laptop',
    objective: 'LIMIT_AND_PRIORITIZE',
    source: { matching_target: 'CLIENT', client_macs: ['AA:BB:CC:DD:EE:FF'] },
    destination: { matching_target: 'ANY', port_matching_type: 'ANY' },
    download_limit_kbps: 2048,
    upload_limit_kbps: 1024,
    download_burst: 'OFF',
    upload_burst: 'OFF',
    enabled: false,
    schedule: { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
    index: 10004,
  };
  const legacy = qosRuleToLegacy(q);

  // The UI/DB fields are present.
  assert.strictEqual(legacy.description, 'Cap the laptop');
  assert.strictEqual(legacy.action, 'ALLOW');
  assert.strictEqual(legacy.bandwidth_limit.enabled, false);
  assert.deepStrictEqual(legacy.target_devices, [{ client_mac: 'AA:BB:CC:DD:EE:FF', type: 'CLIENT' }]);
  // The native fields survive so a toggle/update can PUT the whole object back.
  assert.strictEqual(legacy.objective, 'LIMIT_AND_PRIORITIZE');
  assert.strictEqual(legacy.index, 10004);
  assert.strictEqual(isQosRule(legacy), true, 'translated object is still detected as a QoS rule');
});
