import { useState, useEffect } from 'react';


// Fetches the full controller client list (/getalldevices), which can be large
// and memory-hungry on low-memory browsers (iOS). `enabled` gates the fetch:
//   - default true  -> fetched immediately (the dedicated /alldevices page needs it)
//   - false         -> nothing is fetched until the consumer flips it on (the home
//                      page only fetches when the Add Device modal is opened)
export default function useFetchAllDevices(enabled = true)
{
    const [clientDevices, setClientDevices] = useState([]);
    const [deviceList, setDeviceList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reRender, setReRender] = useState(false);

    function reFetch() {
        setReRender(prev => !prev);
    }
    function checkIfDeviceOnList(allDevicesArray, devicesOnListArray) {
        return allDevicesArray.map((clientDevice) => {
            const onListDevice = devicesOnListArray.find(
                (deviceOnList) => deviceOnList.macAddress === clientDevice.mac
            );

            return {
                ...clientDevice,
                onList: Boolean(onListDevice),
                prismaDeviceId: onListDevice?.id ?? null
            };
        });
    }

    useEffect(() => {
        // Skip the expensive /getalldevices call until the consumer needs it.
        if (!enabled) return;
        let isActive = true;
        const controller = new AbortController();

        const fetchBlocked = async () => {

            try {
                const response = await fetch('/getalldevices', {
                    signal: controller.signal
                });
                if (!response.ok) {
                    throw new Error('Fetching all blocked devices Failed!');
                }
                const clientDev = await response.json();

                if (!isActive) return;

                setClientDevices(
                    checkIfDeviceOnList(
                        clientDev.getClientDevices || [],
                        clientDev.getDeviceList || []
                    )
                );

                const findDevicesOnList = () => {
                    const result = [];
                    for (const matches of clientDev.getDeviceList || []) {
                        const dList = (clientDev.getClientDevices || []).filter((deviceOnList) => {
                            return matches.macAddress === deviceOnList.mac
                        })
                        result.push(...dList)
                    }
                    return result;
                }
                const devicesOnList = findDevicesOnList();
                setDeviceList(devicesOnList)
                setLoading(false);
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return;
                }
                console.error(error);
                if (isActive) {
                    setLoading(false);
                }
            }
        }

        fetchBlocked();

        return () => {
            isActive = false;
            controller.abort();
        };
    }, [reRender, enabled])

    return { clientDevices, deviceList, loading, reFetch };
}