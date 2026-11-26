// Fixture data for the harness. Shaped to match what the real endpoints return
// (see server/Routes/*.js) so components mount without a controller.

export const devices = [
    {
        id: 1,
        macAddress: 'aa:bb:cc:dd:ee:01',
        name: 'Kid iPad',
        hostname: 'ipad-kid',
        ipAddress: '192.168.0.11',
        vendor: 'Apple',
        active: true,
        blocked: false,
        is_wired: false,
        signal: -54,
        network: 'LAN',
        os_name: 'iPadOS',
        device_type: 'tablet',
        tags: ['kids'],
        note: 'Bedtime schedule applies',
        pausedUntil: null,
        bonusTimeActive: false,
        dailyTimeLimit: 120,
        timeUsedToday: 45,
        watchConnection: true,
        watchOffline: false
    },
    {
        id: 2,
        macAddress: 'aa:bb:cc:dd:ee:02',
        name: 'Teen Phone',
        hostname: 'pixel',
        ipAddress: '192.168.0.12',
        vendor: 'Google',
        active: true,
        blocked: true,
        is_wired: false,
        signal: -61,
        network: 'LAN',
        os_name: 'Android',
        device_type: 'phone',
        tags: ['teen'],
        note: '',
        pausedUntil: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // paused, 25 min left
        bonusTimeActive: false,
        dailyTimeLimit: 180,
        timeUsedToday: 170,
        watchConnection: false,
        watchOffline: true
    },
    {
        id: 3,
        macAddress: 'aa:bb:cc:dd:ee:03',
        name: 'Living Room TV',
        hostname: 'tv-lounge',
        ipAddress: '192.168.0.13',
        vendor: 'LG Electronics',
        active: false,
        blocked: false,
        is_wired: true,
        signal: null,
        network: 'LAN',
        os_name: null,
        device_type: 'tv',
        tags: [],
        note: '',
        pausedUntil: null,
        bonusTimeActive: true,
        dailyTimeLimit: 0,
        timeUsedToday: 0,
        watchConnection: false,
        watchOffline: false
    },
    {
        id: 4,
        macAddress: 'aa:bb:cc:dd:ee:04',
        name: 'Work Laptop',
        hostname: 'macbook',
        ipAddress: '192.168.0.14',
        vendor: 'Apple',
        active: true,
        blocked: false,
        is_wired: false,
        signal: -48,
        network: 'LAN',
        os_name: 'macOS',
        device_type: 'laptop',
        tags: ['work'],
        note: 'Never restrict',
        pausedUntil: null,
        bonusTimeActive: false,
        dailyTimeLimit: 0,
        timeUsedToday: 0,
        watchConnection: false,
        watchOffline: false
    }
];

export const blockedUsers = devices
    .filter((d) => d.blocked)
    .map((d) => ({ mac: d.macAddress, name: d.name }));

export const deviceGroups = [
    { id: 1, name: 'Kids', deviceIds: [1, 2] },
    { id: 2, name: 'Media', deviceIds: [3] }
];

export const trafficRules = [
    { _id: 'rule-1', name: 'Block social', enabled: true, matching_target: 'INTERNET', action: 'BLOCK', target_devices: [], app_ids: [] },
    { _id: 'rule-2', name: 'Speed limit TV', enabled: true, matching_target: 'INTERNET', action: 'ALLOW', bandwidth_limit: { enabled: true, download_limit_kbps: 5000, upload_limit_kbps: 2000 }, target_devices: [{ mac: 'aa:bb:cc:dd:ee:03' }], app_ids: [] }
];

export const dbRules = [
    { id: 1, unifiId: 'rule-1', name: 'Block social' }
];

// /getscheduledata returns both shapes the scheduler renders: cron rows and the
// EasySched time-of-day rows.
export const schedules = {
    cronData: [
        { id: 1, crontime: '0 22 * * 1-5', crontype: 'block', toggleCron: true, deviceId: 1, jobName: 'bedtime' },
        { id: 2, crontime: '0 7 * * 1-5', crontype: 'allow', toggleCron: true, deviceId: 1, jobName: 'morning' }
    ],
    // Kept empty on purpose: with rows present, EZScheduleTable renders
    // DisplayOneTimeOrRecurringSchedule, which imports `convertDigitsToDOW` from
    // ../../utility_functions/convertDigitsToDOTW — a module that does not exist
    // (src/utility_functions/ has no such file), so the import is undefined and
    // the render throws. See the card filed for that defect; flip this row in
    // when it is fixed.
    ezScheduleData: []
};

// A row to reproduce the crash above.
export const ezScheduleRow = {
    id: 3, scheduletype: 'recurring', blockAllow: 'block', hour: 6, minute: 30,
    ampm: 'PM', days: ['M', 'T', 'W', 'Th', 'F'], date: null, oneTime: null,
    toggleSched: true, deviceId: 1, jobName: 'evening'
};

export const activityLog = [
    { id: 1, action: 'blocked', reason: 'schedule', mac: 'aa:bb:cc:dd:ee:01', timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), device_name: 'Kid iPad' },
    { id: 2, action: 'unblocked', reason: 'bonus', mac: 'aa:bb:cc:dd:ee:02', timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(), device_name: 'Teen Phone' }
];

export const theme = { theme: 'light' };
