import { useEffect, useRef } from 'react';
import { useNow } from './clockContext.js';

// Remaining milliseconds until `deadlineMs`, recomputed from the shared clock,
// with `onExpire` called exactly once when it reaches zero.
//
// Every countdown on the page derives from the one interval TimerProvider runs,
// so N timers cost one interval rather than N.
export function useCountdown(deadlineMs, onExpire) {
    const now = useNow();
    const active = deadlineMs !== null && deadlineMs !== undefined;
    const remaining = active ? Math.max(0, deadlineMs - now) : null;

    const expireRef = useRef(onExpire);
    expireRef.current = onExpire;
    const firedRef = useRef(false);

    useEffect(() => {
        if (!active) {
            firedRef.current = false;
        }
    }, [active]);

    useEffect(() => {
        if (!active || remaining > 0 || firedRef.current) return;
        firedRef.current = true;
        expireRef.current?.();
    }, [active, remaining]);

    return { remaining, active };
}
