import { useEffect, useRef, useState } from 'react';

// One shared refresh channel for the whole page.
//
// The server exposes /pingmacaddresses as a fixed-interval Server-Sent Events
// ping (server/Routes/devices.js): every `refreshRate` it writes
// `{"sendFakeEventObj":{"refresh":true}}`. The payload is ignored — a
// subscriber only learns "something may have changed".
//
// Before this existed, three components each ran their own 30 s timer and
// AdminConsole opened its own EventSource, so a single tab held four timers and
// a second connection. This module owns:
//   * exactly one EventSource for the page,
//   * exactly one fallback interval, used only while the stream is down,
//   * the list of subscribers both of those notify.
//
// Usage:
//   useRefreshStream(() => fetchSomething());
// The callback runs on every stream message, and every `fallbackIntervalMs`
// while the stream is unavailable (it recovers on reconnect).

const STREAM_URL = '/pingmacaddresses';
export const FALLBACK_INTERVAL_MS = 30000;

const subscribers = new Set();
const stateListeners = new Set();

let source = null;
let fallbackTimer = null;
let closeTimer = null;
let connected = false;

function notifySubscribers() {
    subscribers.forEach((callback) => {
        try {
            callback();
        } catch (error) {
            console.error('Refresh subscriber failed:', error);
        }
    });
}

function setConnected(next) {
    if (connected === next) return;
    connected = next;
    stateListeners.forEach((listener) => listener(next));
    ensureFallbackTimer();
}

// Exactly one interval for the page, and only while the stream is down.
function ensureFallbackTimer() {
    const shouldRun = !connected && subscribers.size > 0;

    if (!shouldRun) {
        if (fallbackTimer !== null) {
            clearInterval(fallbackTimer);
            fallbackTimer = null;
        }
        return;
    }

    if (fallbackTimer === null) {
        fallbackTimer = setInterval(notifySubscribers, FALLBACK_INTERVAL_MS);
    }
}

// Close on the next task, not immediately: React (and StrictMode in dev)
// unmounts and remounts effects back to back, and closing inside the cleanup
// would open a second connection a tick later.
function scheduleClose() {
    if (closeTimer !== null || subscribers.size > 0) return;
    closeTimer = setTimeout(() => {
        closeTimer = null;
        if (subscribers.size === 0) closeSource();
    }, 0);
}

function cancelScheduledClose() {
    if (closeTimer === null) return;
    clearTimeout(closeTimer);
    closeTimer = null;
}

function closeSource() {
    if (source === null) return;
    try {
        source.close();
    } catch {
        // Already closed: nothing to do.
    }
    source = null;
    setConnected(false);
}

function ensureSource() {
    cancelScheduledClose();
    if (source !== null) return;
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') return;

    try {
        source = new window.EventSource(STREAM_URL);
    } catch (error) {
        // No EventSource support: every subscriber just uses the fallback timer.
        console.error('Refresh stream unavailable:', error);
        source = null;
        setConnected(false);
        return;
    }

    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
        if (event) notifySubscribers();
    };
    source.onerror = () => {
        // EventSource reconnects by itself; meanwhile the shared fallback runs.
        setConnected(false);
    };
}

export function useRefreshStream(onRefresh) {
    const callbackRef = useRef(onRefresh);
    callbackRef.current = onRefresh;

    const [streamConnected, setStreamConnected] = useState(connected);

    useEffect(() => {
        const subscriber = () => callbackRef.current?.();
        subscribers.add(subscriber);

        const listener = (value) => setStreamConnected(value);
        stateListeners.add(listener);
        listener(connected);

        ensureSource();
        ensureFallbackTimer();

        return () => {
            subscribers.delete(subscriber);
            stateListeners.delete(listener);
            ensureFallbackTimer();
            // Last subscriber gone: stop the connection rather than leave it open
            // for the lifetime of the module (HMR, tests, a full-tree unmount).
            scheduleClose();
        };
    }, []);

    return { streamConnected };
}

// Exposed for the harness/tests: how many subscribers and timers exist right now.
export function __refreshStreamStats() {
    return {
        subscribers: subscribers.size,
        connected,
        hasSource: source !== null,
        hasFallbackTimer: fallbackTimer !== null
    };
}
