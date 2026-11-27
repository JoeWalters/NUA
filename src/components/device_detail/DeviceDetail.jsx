import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// One device, on its own page: /devices/:id
//
// The card's "More" region was local state, so nothing about a device could be
// linked to or sent to anyone. This page shows the same identity and state, plus
// the *resolved* block mode — the value a block action would actually apply,
// resolved by the server with the same helper the block path uses
// (server/server_util_funcs/blockMode.js: device → group → global).

const BLOCK_MODES = {
    full: { label: 'Full block', hint: 'Device is disconnected from the network.' },
    internet: { label: 'Internet block', hint: 'Device stays online but has no internet access.' },
    speedlimit: { label: 'Speed limit', hint: 'Device stays online at an unusably slow speed.' }
};

function blockModeInfo(mode) {
    return BLOCK_MODES[mode] || BLOCK_MODES.full;
}

const EVENT_LABELS = {
    block: 'Blocked',
    unblock: 'Unblocked',
    pause: 'Paused',
    unpause: 'Resumed',
    bonus_start: 'Bonus time started',
    bonus_end: 'Bonus time ended'
};

function eventLabel(type) {
    return EVENT_LABELS[type] || type || 'Event';
}

function formatTimestamp(value) {
    if (!value) return '';
    const when = new Date(value);
    return Number.isNaN(when.getTime()) ? String(value) : when.toLocaleString();
}

function formatPausedUntil(value) {
    if (!value) return null;
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return String(value);
    return when.toLocaleString();
}

export default function DeviceDetail() {
    const { id } = useParams();
    const [state, setState] = useState({ status: 'loading', device: null, error: null });
    const [history, setHistory] = useState({ status: 'idle', logs: [], error: null });
    const [overview, setOverview] = useState({ status: 'idle', cron: [], easy: [], rules: [], error: null });

    useEffect(() => {
        let active = true;
        const load = async () => {
            setState({ status: 'loading', device: null, error: null });
            try {
                const response = await fetch('/getspecificdevice', {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: Number(id) })
                });

                if (response.status === 404) {
                    if (active) setState({ status: 'not-found', device: null, error: null });
                    return;
                }
                if (!response.ok) {
                    throw new Error(`Could not load this device (${response.status})`);
                }

                const device = await response.json();
                if (!device || !device.id) {
                    if (active) setState({ status: 'not-found', device: null, error: null });
                    return;
                }
                if (active) setState({ status: 'ready', device, error: null });
            } catch (error) {
                if (active) setState({ status: 'error', device: null, error: error.message || 'Could not load this device' });
            }
        };
        load();
        return () => { active = false; };
    }, [id]);

    // Schedules and rules that apply to this device. One DB-only endpoint, because
    // the rule list the editors use needs a live controller.
    useEffect(() => {
        if (state.status !== 'ready') return undefined;
        let active = true;
        setOverview({ status: 'loading', cron: [], easy: [], rules: [], error: null });

        (async () => {
            try {
                const response = await fetch('/getdeviceoverview', {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: Number(id) })
                });
                if (!response.ok) throw new Error(`Could not load schedules and rules (${response.status})`);
                const body = await response.json();
                if (active) {
                    setOverview({
                        status: 'ready',
                        cron: Array.isArray(body?.cron) ? body.cron : [],
                        easy: Array.isArray(body?.easy) ? body.easy : [],
                        rules: Array.isArray(body?.rules) ? body.rules : [],
                        error: null
                    });
                }
            } catch (error) {
                if (active) setOverview({ status: 'error', cron: [], easy: [], rules: [], error: error.message || 'Could not load schedules and rules' });
            }
        })();

        return () => { active = false; };
    }, [state.status, id]);

    // Activity history for this device. The endpoint filters server-side
    // (?deviceMac=) and returns newest first, so no client-side sorting is needed.
    const deviceMac = state.status === 'ready' ? state.device.macAddress : null;
    useEffect(() => {
        if (!deviceMac) return undefined;
        let active = true;
        setHistory({ status: 'loading', logs: [], error: null });

        (async () => {
            try {
                const response = await fetch(`/activity-log?deviceMac=${encodeURIComponent(deviceMac)}&limit=25`);
                if (!response.ok) throw new Error(`Could not load activity (${response.status})`);
                const body = await response.json();
                const logs = Array.isArray(body?.logs) ? body.logs : [];
                if (active) setHistory({ status: 'ready', logs, error: null });
            } catch (error) {
                if (active) setHistory({ status: 'error', logs: [], error: error.message || 'Could not load activity' });
            }
        })();

        return () => { active = false; };
    }, [deviceMac]);

    if (state.status === 'loading') {
        return (
            <div className="p-6 flex items-center gap-3 text-base-content/60">
                <span className="loading loading-spinner loading-sm" />
                Loading device {id}…
            </div>
        );
    }

    if (state.status === 'not-found') {
        return (
            <div className="p-6 max-w-xl" role="status">
                <h1 className="text-xl font-bold mb-2">Device not found</h1>
                <p className="text-base-content/70 mb-4">
                    No device with id <span className="font-mono">{id}</span> is on the device list.
                </p>
                <Link to="/" className="btn btn-sm btn-primary">Back to all devices</Link>
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <div className="p-6 max-w-xl" role="alert">
                <h1 className="text-xl font-bold mb-2">Could not load this device</h1>
                <p className="text-error mb-4">{state.error}</p>
                <Link to="/" className="btn btn-sm btn-primary">Back to all devices</Link>
            </div>
        );
    }

    const { device } = state;
    const blocked = device.blocked === true || device.active === false;
    const paused = Boolean(device.pausedUntil);
    const mode = blockModeInfo(device.resolvedBlockMode);

    return (
        <div className="p-4 sm:p-6 max-w-3xl">
            <nav className="text-sm text-base-content/60 mb-3" aria-label="Breadcrumb">
                <Link to="/" className="link">All devices</Link>
                <span aria-hidden="true"> / </span>
                <span>{device.name || device.macAddress}</span>
            </nav>

            <h1 className="text-2xl font-bold mb-1">{device.name || device.macAddress || 'Unknown device'}</h1>
            <p className="font-mono text-sm text-base-content/60 mb-6">{device.macAddress}</p>

            <section className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6" aria-labelledby="device-state-heading">
                <h2 id="device-state-heading" className="text-lg font-semibold mb-4">State</h2>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <dt className="text-sm text-base-content/60">Access</dt>
                        <dd className="font-medium">
                            <span className={`badge ${blocked ? 'badge-error' : 'badge-success'}`}>
                                {blocked ? 'Blocked' : 'Allowed'}
                            </span>
                        </dd>
                    </div>

                    <div>
                        <dt className="text-sm text-base-content/60">Pause</dt>
                        <dd className="font-medium">
                            {paused ? (
                                <>
                                    Paused until <time dateTime={device.pausedUntil}>{formatPausedUntil(device.pausedUntil)}</time>
                                </>
                            ) : 'Not paused'}
                        </dd>
                    </div>

                    <div>
                        <dt className="text-sm text-base-content/60">Block mode</dt>
                        <dd className="font-medium">
                            {mode.label}
                            <span className="block text-sm text-base-content/60">{mode.hint}</span>
                            {device.blockMode ? (
                                <span className="block text-xs text-base-content/50">Set on this device</span>
                            ) : device.deviceGroup?.defaultBlockMode ? (
                                <span className="block text-xs text-base-content/50">Inherited from the group</span>
                            ) : (
                                <span className="block text-xs text-base-content/50">Global default</span>
                            )}
                        </dd>
                    </div>

                    <div>
                        <dt className="text-sm text-base-content/60">Connection</dt>
                        <dd className="font-medium">
                            {device.is_wired ? 'Wired' : 'WiFi'}
                            {device.ipAddress ? <span className="block text-sm text-base-content/60">{device.ipAddress}</span> : null}
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6 mt-4" aria-labelledby="device-activity-heading">
                <h2 id="device-activity-heading" className="text-lg font-semibold mb-4">Activity</h2>

                {history.status === 'loading' && (
                    <p className="text-base-content/60 flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" />
                        Loading activity…
                    </p>
                )}

                {history.status === 'error' && (
                    <p role="alert" className="text-error">{history.error}</p>
                )}

                {history.status === 'ready' && history.logs.length === 0 && (
                    <p className="text-base-content/60">No activity recorded for this device yet.</p>
                )}

                {history.status === 'ready' && history.logs.length > 0 && (
                    <ul className="divide-y divide-base-300">
                        {history.logs.map((log) => (
                            <li key={log.id} className="py-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                                <span className="font-medium">{eventLabel(log.eventType)}</span>
                                <span className="text-sm text-base-content/70">{log.detail || '—'}</span>
                                <time className="text-xs text-base-content/50" dateTime={log.timestamp}>
                                    {formatTimestamp(log.timestamp)}
                                </time>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6 mt-4" aria-labelledby="device-schedules-heading">
                <div className="flex items-baseline justify-between gap-2 mb-4">
                    <h2 id="device-schedules-heading" className="text-lg font-semibold">Schedules</h2>
                    <Link to={`/devices/${id}/schedule`} className="link text-sm">Open the scheduler</Link>
                </div>

                {overview.status === 'loading' && (
                    <p className="text-base-content/60 flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" />
                        Loading schedules…
                    </p>
                )}
                {overview.status === 'error' && <p role="alert" className="text-error">{overview.error}</p>}

                {overview.status === 'ready' && overview.cron.length === 0 && overview.easy.length === 0 && (
                    <p className="text-base-content/60">No schedules apply to this device.</p>
                )}

                {overview.status === 'ready' && (overview.cron.length > 0 || overview.easy.length > 0) && (
                    <ul className="divide-y divide-base-300">
                        {overview.cron.map((row) => (
                            <li key={`cron-${row.id}`} className="py-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                                <span className="font-mono text-sm">{row.crontime}</span>
                                <span className="text-sm">{row.crontype === 'block' ? 'Blocks' : 'Allows'}</span>
                                <span className="text-xs text-base-content/50">{row.scope === 'group' ? 'From the device group' : 'On this device'}</span>
                            </li>
                        ))}
                        {overview.easy.map((row) => (
                            <li key={`easy-${row.id}`} className="py-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                                <span className="font-mono text-sm">
                                    {String(row.hour).padStart(2, '0')}:{String(row.minute).padStart(2, '0')} {row.ampm}
                                    {row.oneTime ? ` on ${row.date}` : ''}
                                </span>
                                <span className="text-sm">{row.blockAllow === 'block' ? 'Blocks' : 'Allows'}</span>
                                <span className="text-xs text-base-content/50">{row.scope === 'group' ? 'From the device group' : 'On this device'}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {overview.status === 'ready' && overview.cron.concat(overview.easy).some((row) => row.scope === 'group') && (
                    <p className="text-xs text-base-content/50 mt-2">
                        Rows marked &ldquo;From the device group&rdquo; come from a group default; the
                        scheduler below shows this device&rsquo;s own rows only, so edit those in the group settings.
                    </p>
                )}
            </section>

            <section className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6 mt-4" aria-labelledby="device-rules-heading">
                <div className="flex items-baseline justify-between gap-2 mb-4">
                    <h2 id="device-rules-heading" className="text-lg font-semibold">Traffic rules</h2>
                    <Link to="/" className="link text-sm">Manage rules</Link>
                </div>

                {overview.status === 'error' && <p role="alert" className="text-error">{overview.error}</p>}

                {overview.status === 'ready' && overview.rules.length === 0 && (
                    <p className="text-base-content/60">No traffic rules target this device.</p>
                )}

                {overview.status === 'ready' && overview.rules.length > 0 && (
                    <ul className="divide-y divide-base-300">
                        {overview.rules.map((rule) => (
                            <li key={`rule-${rule.id}`} className="py-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                                <span className="font-medium">{rule.description || `Rule ${rule.id}`}</span>
                                <span className="text-sm">{rule.blockAllow === 'block' ? 'Block' : 'Allow'}</span>
                                <span className="text-xs text-base-content/50">{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="text-xs text-base-content/50 mt-4">
                Editing happens in the scheduler and the rules manager — this page is read-only.
            </p>
        </div>
    );
}
