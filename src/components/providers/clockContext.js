import { createContext, useContext } from 'react';

// The shared countdown clock. TimerProvider supplies the value; useCountdown
// reads it. It lives in its own module so the provider file exports only a
// component (keeps react-refresh happy) and hooks can be imported anywhere.

export const ClockContext = createContext(null);

export function useNow() {
    const now = useContext(ClockContext);
    return now ?? Date.now();
}
