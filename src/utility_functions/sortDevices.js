export const DEVICE_SORT_MODES = ['name', 'status'];
export const DEVICE_SORT_STORAGE_KEY = 'nua-device-sort';
export const DEVICE_STATUS_ORDER = ['blocked', 'paused', 'bonus', 'allowed'];

// D2 precedence: blocked -> paused -> bonus -> allowed (first match wins).
export function getDeviceStatus(device, now = Date.now()) {
    if (device?.active === false) return 'blocked';
    const pausedUntil = device?.pausedUntil ? new Date(device.pausedUntil).getTime() : NaN;
    if (!Number.isNaN(pausedUntil) && pausedUntil > now) return 'paused';
    if (device?.bonusTimeActive === true) return 'bonus';
    return 'allowed';
}

export function sortDevices(devices, mode = 'status', now = Date.now()) {
    const effectiveMode = DEVICE_SORT_MODES.includes(mode) ? mode : 'status';
    const list = [...(devices || [])];

    if (effectiveMode === 'name') {
        return list.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }

    return list.sort((a, b) => {
        const aStatus = DEVICE_STATUS_ORDER.indexOf(getDeviceStatus(a, now));
        const bStatus = DEVICE_STATUS_ORDER.indexOf(getDeviceStatus(b, now));
        if (aStatus !== bStatus) return aStatus - bStatus;
        return (a?.name || '').localeCompare(b?.name || '');
    });
}

export function getCachedDeviceSort() {
    if (typeof document === 'undefined') return 'status';

    try {
        const cached = localStorage.getItem(DEVICE_SORT_STORAGE_KEY);
        return DEVICE_SORT_MODES.includes(cached) ? cached : 'status';
    } catch (e) {
        // In case of localStorage error (e.g. Safari private mode), default to status
        return 'status';
    }
}

export function cacheDeviceSort(mode) {
    if (typeof document === 'undefined') return;
    if (!DEVICE_SORT_MODES.includes(mode)) return;

    try {
        localStorage.setItem(DEVICE_SORT_STORAGE_KEY, mode);
    } catch (e) {
        // Ignore localStorage errors
    }
}
