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

function formatPausedUntil(value) {
    if (!value) return null;
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return String(value);
    return when.toLocaleString();
}

export default function DeviceDetail() {
    const { id } = useParams();
    const [state, setState] = useState({ status: 'loading', device: null, error: null });

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

            <p className="text-xs text-base-content/50 mt-4">
                Activity history, schedules and rules are on their own cards.
            </p>
        </div>
    );
}
