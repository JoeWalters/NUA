import { useCallback, useEffect, useRef, useState } from 'react';
import { DevicesContext } from './devicesContext.js';

// One fetch of /getcurrentdevices for the whole page.
//
// Before this, each traffic-rule modal fetched the list on mount, so opening
// Create → Speed Limit → Edit issued three identical requests. The provider
// fetches once (on the first component that asks) and every consumer reads the
// same list; `refetch()` is the single invalidation point, used by the refresh
// control and after a rule/device change.
//
// Mount it once around the app (see main.jsx), then:
//   const { devices, loading, error, refetch } = useDevices();

export function DevicesProvider({ children }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inFlight = useRef(false);
    const loadedOnce = useRef(false);

    const load = useCallback(async (force = false) => {
        if (inFlight.current) return;
        if (loadedOnce.current && !force) return;

        inFlight.current = true;
        setLoading(true);
        try {
            const res = await fetch('/getcurrentdevices');
            if (!res.ok) throw new Error(`Could not load devices (${res.status})`);
            const data = await res.json();
            setDevices(data.getDeviceList || []);
            setError(null);
            loadedOnce.current = true;
        } catch (err) {
            // Keep any list we already have; surface the failure to the consumer.
            setError(err.message || 'Could not load devices');
            console.error('DevicesProvider: could not load devices:', err);
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    }, []);

    const refetch = useCallback(() => load(true), [load]);

    // Consumers call ensureLoaded() on mount; the first call fetches, the rest
    // read the cached list.
    const ensureLoaded = useCallback(() => { load(false); }, [load]);

    useEffect(() => {
        // Nothing to do on mount: fetching is deferred until a consumer asks.
    }, []);

    const value = { devices, loading, error, refetch, ensureLoaded };

    return <DevicesContext.Provider value={value}>{children}</DevicesContext.Provider>;
}
