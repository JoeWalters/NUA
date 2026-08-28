import { useState, useEffect } from "react";

// Fetches the full controller client list (/getalldevices), which is large and
// memory-hungry on low-memory browsers (iOS). It is only needed for the "Import
// UniFi Rules" action, so `enabled` gates the fetch: nothing is loaded until the
// consumer turns it on (e.g. when the import modal is opened).
export function useGetAllDevices(enabled = false) {
    const [existingDeviceList, setExistingDeviceList] = useState([]);
    const [allClientDeviceList, setAllClientDeviceList] = useState([]);

    useEffect(() => {
        if (!enabled) return;
        const getAllDevices = async () => {
            try {
                const getDevicesFromDB = await fetch('/getalldevices');
                if (getDevicesFromDB.ok) {
                    const { getDeviceList, getClientDevices } = await getDevicesFromDB.json();
                    setExistingDeviceList([...getDeviceList]);
                    setAllClientDeviceList([...getClientDevices])
                }
            } catch (error) {
                console.error(error);
            }
        }
        getAllDevices();
    }, [enabled])

    return { existingDeviceList, allClientDeviceList };
}