// Card #40: the device detail page's schedules + rules sections come from
// /getdeviceoverview, which must return the device's own schedules (and its
// group's), and only the traffic rules that actually target its MAC address.

const { test } = require('node:test');
const assert = require('node:assert');

const { registerdevices } = require('../Routes/devices');

function setup(overrides = {}) {
    let handler = null;
    const app = { get() {}, post(route, fn) { if (route === '/getdeviceoverview') handler = fn; }, put() {}, delete() {}, patch() {}, use() {} };

    const device = overrides.device === undefined
        ? { id: 1, macAddress: 'aa:bb:cc:dd:ee:01', deviceGroupId: 7 }
        : overrides.device;

    const calls = [];
    const prisma = {
        device: { findUnique: async (args) => { calls.push(['device.findUnique', args]); return device; } },
        cron: { findMany: async (args) => { calls.push(['cron.findMany', args]); return overrides.cron || []; } },
        easySchedule: { findMany: async (args) => { calls.push(['easySchedule.findMany', args]); return overrides.easy || []; } },
        trafficRules: { findMany: async (args) => { calls.push(['trafficRules.findMany', args]); return overrides.rules || []; } },
        credentials: { findUnique: async () => ({ id: 1 }) }
    };

    registerdevices(app, {
        prisma, schedule: {}, withUnifiRetry: (fn) => fn(), isUnauthorizedUnifiError: () => false,
        getBlockedUsers: async () => [], unBlockMultiple: async () => {}, unblockSingle: async () => {},
        isValidMac: () => true, sendError: (res) => res.status(500).json({ error: 'x' }),
        handleLoginError: () => {}, isDiagnosticsEnabled: async () => false,
        stopBonusTime: async () => {}, timeoutMap: new Map(), getUnifi: () => null
    });

    assert.ok(handler, '/getdeviceoverview was registered');
    return { handler, calls };
}

function fakeRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

test('device and group schedules are both returned, tagged with their scope', async () => {
    const { handler, calls } = setup({
        cron: [
            { id: 1, crontime: '0 22 * * 1-5', crontype: 'block', deviceId: 1, deviceGroupId: null },
            { id: 9, crontime: '0 7 * * *', crontype: 'allow', deviceId: null, deviceGroupId: 7 }
        ],
        easy: [{ id: 3, hour: 18, minute: 30, ampm: 'PM', blockAllow: 'block', oneTime: false, deviceId: 1 }]
    });
    const res = fakeRes();

    await handler({ body: { id: 1 } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cron.length, 2);
    assert.deepEqual(res.body.cron.map((r) => r.scope), ['device', 'group']);
    assert.equal(res.body.easy.length, 1);
    assert.equal(res.body.easy[0].scope, 'device');

    // the schedule query asks for the device OR its group, not the whole table
    const cronCall = calls.find((c) => c[0] === 'cron.findMany');
    assert.deepEqual(cronCall[1].where, { OR: [{ deviceId: 1 }, { deviceGroupId: 7 }] });
});

test('only rules targeting the device MAC are returned, from either relation', async () => {
    const { handler } = setup({
        rules: [
            { id: 1, description: 'Block social', blockAllow: 'block', enabled: true,
              target_devices: [{ client_mac: 'AA:BB:CC:DD:EE:01' }], trafficRuleDevices: [] },
            { id: 2, description: 'Speed limit TV', blockAllow: 'allow', enabled: true,
              target_devices: [], trafficRuleDevices: [{ macAddress: 'aa:bb:cc:dd:ee:01' }] },
            { id: 3, description: 'Unrelated', blockAllow: 'block', enabled: true,
              target_devices: [{ client_mac: 'aa:bb:cc:dd:ee:99' }], trafficRuleDevices: [] }
        ]
    });
    const res = fakeRes();

    await handler({ body: { id: 1 } }, res);

    assert.deepEqual(res.body.rules.map((r) => r.id), [1, 2], 'case-insensitive match on either relation');
    // the response is a summary, not the whole rule with its relations
    assert.deepEqual(Object.keys(res.body.rules[0]).sort(), ['blockAllow', 'bonusTimeExpiresAt', 'description', 'enabled', 'id']);
});

test('an unknown device is a 404 and a non-numeric id is a 400', async () => {
    const missing = setup({ device: null });
    const res404 = fakeRes();
    await missing.handler({ body: { id: 42 } }, res404);
    assert.equal(res404.statusCode, 404);

    const { handler } = setup();
    const res400 = fakeRes();
    await handler({ body: { id: 'abc' } }, res400);
    assert.equal(res400.statusCode, 400);
});

test('a device with no group is queried on its own id only', async () => {
    const { handler, calls } = setup({ device: { id: 1, macAddress: 'aa:01', deviceGroupId: null } });
    await handler({ body: { id: 1 } }, fakeRes());
    const cronCall = calls.find((c) => c[0] === 'cron.findMany');
    assert.deepEqual(cronCall[1].where, { deviceId: 1 });
});

test('empty results are empty arrays, never undefined', async () => {
    const { handler } = setup({ cron: [], easy: [], rules: [] });
    const res = fakeRes();
    await handler({ body: { id: 1 } }, res);
    assert.deepEqual(res.body.cron, []);
    assert.deepEqual(res.body.easy, []);
    assert.deepEqual(res.body.rules, []);
});
