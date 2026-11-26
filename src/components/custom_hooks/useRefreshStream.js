import { useEffect, useRef, useState } from 'react';

// One shared refresh channel for the whole page.
//
// The server exposes /pingmacaddresses as a fixed-interval Server-Sent Events
// ping (server/Routes/devices.js): every `refreshRate` it writes a message and
// nothing more. It carries no payload, so a subscriber only learns "something
// may have changed".
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
export const DEFAULT_FALLBACK_MS = 30000;

const subscribers = new Set();
const stateListeners = new Set();

let source = null;
let fallbackTimer = null;
let fallbackIntervalMs = DEFAULT_FALLBACK_MS;
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
        fallbackTimer = setInterval(notifySubscribers, fallbackIntervalMs);
    }
}

function ensureSource() {
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

export function useRefreshStream(onRefresh, { fallbackIntervalMs: intervalMs = DEFAULT_FALLBACK_MS } = {}) {
    const callbackRef = useRef(onRefresh);
    callbackRef.current = onRefresh;

    const [streamConnected, setStreamConnected] = useState(connected);

    useEffect(() => {
        const subscriber = () => callbackRef.current?.();
        subscribers.add(subscriber);
        fallbackIntervalMs = Math.min(fallbackIntervalMs, intervalMs);

        const listener = (value) => setStreamConnected(value);
        stateListeners.add(listener);
        listener(connected);

        ensureSource();
        ensureFallbackTimer();

        return () => {
            subscribers.delete(subscriber);
            stateListeners.delete(listener);
            ensureFallbackTimer();
        };
    }, [intervalMs]);

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
