import useFetchBlockedDevices from "./useFetchBlockedDevices";
import useFetchBlockedReasons from "./useFetchBlockedReasons";
import BlockedDeviceCard from "./BlockedDeviceCard";
import DeviceCardSkeleton from "../skeletons/DeviceCardSkeleton";
import { HiOutlineShieldCheck } from "react-icons/hi2";



export default function BlockedDevices()
{
const { blockedDevices, loading, reFetch } = useFetchBlockedDevices();
const macs = (blockedDevices || []).map((device) => device.mac).filter(Boolean);
const { reasons } = useFetchBlockedReasons(macs);


const handleAddToDevices = async (deviceToAdd) => {
    try {
        const response = await fetch('/addtodevicelist', {
            method: 'POST',
            mode: 'cors',
            headers: {
                "Content-Type" : "application/json"
            },
            body: JSON.stringify(deviceToAdd)
        });
        if (response.ok) {
            const returnData = await response.json();
            // console.log('return data from blocked devices', returnData);
            reFetch();
        }
    } catch (error) {
        console.error(error);
    }
}
const handleUnblock = async (deviceToUnblock) => {
    try {
        const unblock = await fetch('/unblockmac', {
            method: 'POST',
            mode: 'cors',
            headers: {
                "Content-Type" : "application/json"
            },
            body: JSON.stringify(deviceToUnblock)
        });
        if (unblock.ok) {
            reFetch();
        }
    } catch (error) {
        console.error(error);
    }
}

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-8 pb-24">
            <h1 className="my-6 text-3xl italic mx-auto row-start-1 col-span-full text-center">Currently Blocked Devices</h1>
            {
                loading ? <DeviceCardSkeleton devices={blockedDevices} loading={loading} />
                : blockedDevices?.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <HiOutlineShieldCheck className="w-10 h-10 text-base-content/30" />
                        <h3 className="text-lg font-medium text-base-content">No devices are currently blocked</h3>
                        <p className="text-sm text-base-content/50 max-w-sm">
                            Devices appear here when they are blocked by a schedule or from the device list.
                        </p>
                    </div>
                )
                : blockedDevices?.map((device) => {
                    return (
                        <>
                        <div className="flex items-center justify-center">
                            <BlockedDeviceCard key={device.mac} props={device} reason={reasons[device?.mac?.toLowerCase()]} handleAddToDevices={handleAddToDevices} handleUnblock={handleUnblock} />
                        </div>
                        </>
                    )
                })
                }
            </div>
        </>
    );
}