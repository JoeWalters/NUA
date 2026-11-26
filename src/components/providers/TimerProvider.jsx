import { useEffect, useState } from 'react';
import { ClockContext } from './clockContext.js';

// One clock for every countdown on the page.
//
// PauseButton, BonusTimeButton and RuleBonusTimeButton each used to run their own
// one-second interval just to repaint a countdown, so a screen with a paused
// device and two bonus timers ran three intervals (plus a five-second
// /getpausetimer poll). The server already says *when* a timer expires, so the
// display is derived from this one clock instead.
//
// Mount it once around the app (see main.jsx), then in a countdown:
//   const { remaining } = useCountdown(deadlineMs, onExpire);   // useCountdown.js

export function TimerProvider({ children, intervalMs = 1000 }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);

    return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}
