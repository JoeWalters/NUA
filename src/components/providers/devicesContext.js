import { createContext, useContext } from 'react';

// The one device list the rule modals read from. DevicesProvider supplies it;
// useDevices() reads it. Kept in its own module so the provider file exports
// only a component and hooks can be imported anywhere.

export const DevicesContext = createContext(null);

export function useDevices() {
    const value = useContext(DevicesContext);
    if (!value) {
        throw new Error('useDevices must be used inside <DevicesProvider>');
    }
    return value;
}
