// Answer the API calls the UI makes, from fixtures, so the components mount and
// render without the Express server or a UniFi controller.
//
// Every stubbed call is recorded in `window.__harness.calls` — a test can then
// assert "the device list was fetched once" instead of guessing.
import {
    devices, blockedUsers, deviceGroups, trafficRules, dbRules, schedules, activityLog, theme
} from './fixtures.js';

const json = (body, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

export function installFetchStub() {
    const calls = [];
    window.__harness = { calls };

    const routes = {
        '/getmacaddresses': () => json({ getDeviceList: devices, blockedUsers }),
        '/getcurrentdevices': () => json({ getDeviceList: devices }),
        '/getalldevices': () => json({ getDeviceList: devices, getClientDevices: devices }),
        '/getspecificdevice': () => json(devices[0]),
        '/getcurrenttheme': () => json(theme),
        '/updatetheme': () => json({ success: true }),
        '/health': () => json({ unifiConnected: true }),
        '/auth-status': () => json({ enabled: false, authenticated: true }),
        '/getdbcustomapirules': () => json(trafficRules),
        '/getunifirules': () => json(trafficRules),
        '/getrulesfromdb': () => json(dbRules),
        '/getscheduledata': () => json(schedules),
        '/getbonustimesmap': () => json({ timer: 20 * 60 * 1000 }),
        '/getbonusrulesmap': () => json({ timer: 20 * 60 * 1000 }),
        '/getpausetimer': () => json({ timer: 25 * 60 * 1000 }),
        '/getactivitylog': () => json({ logs: activityLog }),
        '/activity-log': () => json({ logs: activityLog }),
        '/getdevicelog': () => json({ logs: activityLog }),
        '/getversion': () => json({ version: 'harness' }),
        '/version': () => json({ version: 'harness' }),
        '/checkjobreinitiation': () => json({ success: true })
    };

    const groupRoutes = () => json(deviceGroups);

    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const path = url.split('?')[0];
        calls.push({ url, method: (init && init.method) || 'GET', at: Date.now() });

        if (path.startsWith('/api/device-groups')) return groupRoutes();
        const handler = routes[path];
        if (handler) return handler();

        // Anything unmapped resolves to an empty OK so a stray GET cannot blow up
        // a scenario; it is still recorded so the README's "unmapped" report works.
        if ((init && init.method && init.method !== 'GET') || path.startsWith('/get') || path.startsWith('/add') || path.startsWith('/update') || path.startsWith('/toggle') || path.startsWith('/remove') || path.startsWith('/unblock') || path.startsWith('/pause') || path.startsWith('/unpause')) {
            return json({ success: true });
        }
        return realFetch(input, init);
    };

    return calls;
}
