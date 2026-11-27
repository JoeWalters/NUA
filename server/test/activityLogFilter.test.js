// Card #39: /activity-log must be filterable by device, newest first, without
// changing the unfiltered behaviour the existing ActivityLog view relies on.
//
// The route is registered through registerdevices(app, ctx). A tiny fake `app`
// captures the handler so the query can be asserted without booting Express or
// a database.

const { test } = require('node:test');
const assert = require('node:assert');

const { registerdevices } = require('../Routes/devices');

function captureGetHandler(path) {
    let handler = null;
    const app = {
        get(route, fn) { if (route === path) handler = fn; },
        post() {}, put() {}, delete() {}, patch() {}, use() {}
    };
    const calls = [];
    const ctx = {
        prisma: {
            activityLog: {
                findMany: async (args) => { calls.push(args); return [{ id: 1, deviceMac: 'aa:bb:cc:dd:ee:01' }]; },
                create: async () => ({})
            },
            credentials: { findUnique: async () => ({ id: 1, initialSetup: false, defaultBlockMode: 'full' }) }
        },
        schedule: {},
        withUnifiRetry: (fn) => fn(),
        isUnauthorizedUnifiError: () => false,
        getBlockedUsers: async () => [],
        unBlockMultiple: async () => {},
        unblockSingle: async () => {},
        isValidMac: () => true,
        sendError: (res) => res.status(500).json({ error: 'x' }),
        handleLoginError: () => {},
        isDiagnosticsEnabled: async () => false,
        stopBonusTime: async () => {},
        timeoutMap: new Map(),
        getUnifi: () => null
    };
    registerdevices(app, ctx);
    assert.ok(handler, `handler for ${path} was registered`);
    return { handler, calls };
}

function fakeRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

test('?deviceMac= filters to that device, newest first, honouring limit (AC1)', async () => {
    const { handler, calls } = captureGetHandler('/activity-log');
    const res = fakeRes();

    await handler({ query: { deviceMac: 'aa:bb:cc:dd:ee:01', limit: '10' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        where: { deviceMac: { in: ['aa:bb:cc:dd:ee:01'] } },
        orderBy: { timestamp: 'desc' },
        take: 10
    });
    assert.equal(res.body.success, true);
    assert.equal(Array.isArray(res.body.logs), true);
});

test('no filter keeps the unfiltered query the existing log view uses (AC4)', async () => {
    const { handler, calls } = captureGetHandler('/activity-log');
    const res = fakeRes();

    await handler({ query: {} }, res);

    assert.deepEqual(calls[0], { where: {}, orderBy: { timestamp: 'desc' }, take: 50 });
});

test('limit is clamped to 200 and defaults to 50', async () => {
    const { handler, calls } = captureGetHandler('/activity-log');

    await handler({ query: { limit: '9999' } }, fakeRes());
    assert.equal(calls[0].take, 200);

    await handler({ query: { limit: 'not-a-number' } }, fakeRes());
    assert.equal(calls[1].take, 50);
});

test('a repeated deviceMac parameter becomes an in-list of macs', async () => {
    const { handler, calls } = captureGetHandler('/activity-log');

    await handler({ query: { deviceMac: ['aa:01', 'aa:02', '  '] } }, fakeRes());
    assert.deepEqual(calls[0].where, { deviceMac: { in: ['aa:01', 'aa:02'] } });
});

test('a failing query returns 500 with an error body rather than throwing', async () => {
    const { handler } = captureGetHandler('/activity-log');
    let captured = null;
    const app = {
        get(route, fn) { if (route === '/activity-log') captured = fn; },
        post() {}, put() {}, delete() {}, patch() {}, use() {}
    };
    registerdevices(app, {
        prisma: { activityLog: { findMany: async () => { throw new Error('db down'); } }, credentials: { findUnique: async () => ({ id: 1 }) } },
        schedule: {}, withUnifiRetry: (fn) => fn(), isUnauthorizedUnifiError: () => false,
        getBlockedUsers: async () => [], unBlockMultiple: async () => {}, unblockSingle: async () => {},
        isValidMac: () => true, sendError: (res) => res.status(500).json({ error: 'x' }),
        handleLoginError: () => {}, isDiagnosticsEnabled: async () => false,
        stopBonusTime: async () => {}, timeoutMap: new Map(), getUnifi: () => null
    });
    void handler;
    const res = fakeRes();
    await captured({ query: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
});
