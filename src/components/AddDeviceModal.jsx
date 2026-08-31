import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import { IoMdRefresh } from "react-icons/io";
import useFetchAllDevices from "./all_devices/useFetchAllDevices";
import AllDevicesCard from "./all_devices/AllDevicesCard";

// Modal to add UniFi controller clients to the managed (firewall-blockable)
// device list. Fetching the large controller client list is lazy: it only
// happens the first time the modal is opened.
//
// `onAdded` is called after a successful add so the parent can refresh.
const AddDeviceModal = forwardRef(function AddDeviceModal({ onAdded }, ref) {
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [allDevicesFilter, setAllDevicesFilter] = useState('all');
    const [allDevicesSearch, setAllDevicesSearch] = useState('');
    const [filteredAllDevices, setFilteredAllDevices] = useState([]);

    const dialogRef = useRef();
    const allDevicesSearchRef = useRef();
    const allDevicesSelectRef = useRef();

    const { clientDevices, loading: allDevicesLoading, reFetch } = useFetchAllDevices(addModalOpen);

    useImperativeHandle(ref, () => ({
        open: () => {
            setAddModalOpen(true);
            dialogRef.current?.showModal();
        },
    }));

    const handleAddToDevices = async (deviceToAdd, submittedName) => {
        if (submittedName !== "" && submittedName !== undefined) {
            deviceToAdd.customName = submittedName;
        }
        try {
            const response = await fetch('/addtodevicelist', {
                method: 'POST',
                mode: 'cors',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(deviceToAdd)
            });
            if (response.ok) {
                await response.json();
                reFetch();
                onAdded?.(); // Refresh the main device list
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleAllDevicesRefresh = () => {
        if (allDevicesSelectRef.current) {
            allDevicesSelectRef.current.selected = true;
        }
        if (allDevicesSearchRef.current) {
            allDevicesSearchRef.current.value = '';
        }
        setAllDevicesFilter('all');
        setAllDevicesSearch('');
        reFetch();
    };

    const handleAllDevicesSearch = (e) => {
        setAllDevicesSearch(e.target.value);
    };

    const handleAllDevicesFilterChange = (e) => {
        setAllDevicesFilter(e.target.value);
    };

    // Filter all devices based on search and filter
    useEffect(() => {
        let filtered = [...clientDevices];

        if (allDevicesSearch) {
            const term = allDevicesSearch.toLowerCase();
            filtered = filtered.filter(device =>
                device?.name?.toLowerCase().includes(term) ||
                device?.note?.toLowerCase().includes(term) ||
                device?.oui?.toLowerCase().includes(term) ||
                device?.mac?.toLowerCase().includes(term) ||
                device?.hostname?.toLowerCase().includes(term) ||
                device?.last_ip?.toLowerCase().includes(term)
            );
        }

        switch (allDevicesFilter) {
            case 'all':
                break;
            case 'Blocked Devices':
                filtered = filtered.filter(device => device.blocked === true);
                break;
            case 'Offline Devices':
                filtered = filtered.filter(device => !device.is_online);
                break;
            case 'Online Devices':
                filtered = filtered.filter(device => device.is_online);
                break;
            case 'Not on Device List':
                filtered = filtered.filter(device => !device.onList);
                break;
            default:
                break;
        }

        setFilteredAllDevices(filtered);
    }, [clientDevices, allDevicesSearch, allDevicesFilter]);

    return (
        <dialog id="addDeviceModal" className="modal" ref={dialogRef}>
            <div className="modal-box w-11/12 max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300 flex-shrink-0">
                    <h3 className="font-bold text-lg">Add Device to Management</h3>
                    <form method="dialog">
                        <button className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
                            <HiXMark className="w-4 h-4" />
                        </button>
                    </form>
                </div>

                {/* Search and Filter Bar */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-base-200">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                            <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 w-4 h-4" />
                            <input
                                ref={allDevicesSearchRef}
                                type="text"
                                placeholder="Search by alias, hostname, vendor, IP, or MAC..."
                                className="input input-bordered input-sm w-full pl-9"
                                onChange={handleAllDevicesSearch}
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                ref={allDevicesSelectRef}
                                className="select select-bordered select-sm w-full sm:w-auto"
                                onChange={handleAllDevicesFilterChange}
                                value={allDevicesFilter}
                            >
                                <option value="all">All Devices</option>
                                <option value="Not on Device List">Not on Device List</option>
                                <option value="Online Devices">Online</option>
                                <option value="Offline Devices">Offline</option>
                                <option value="Blocked Devices">Blocked</option>
                            </select>
                            <button
                                className="btn btn-ghost btn-sm btn-square"
                                onClick={handleAllDevicesRefresh}
                                title="Refresh"
                            >
                                <IoMdRefresh className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="text-xs text-base-content/40 mt-2">
                        {filteredAllDevices.length} device{filteredAllDevices.length !== 1 ? 's' : ''} found
                    </div>
                </div>

                {/* Device List */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {allDevicesLoading ? (
                        <div className="flex justify-center items-center h-full py-12">
                            <span className="loading loading-spinner loading-lg text-primary"></span>
                        </div>
                    ) : filteredAllDevices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-base-content/40 gap-3">
                            <HiMagnifyingGlass className="w-10 h-10" />
                            <p className="text-sm">No devices found matching your criteria.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredAllDevices.map((device, index) => (
                                <AllDevicesCard
                                    key={device.mac || index}
                                    props={device}
                                    length={filteredAllDevices.length}
                                    handleAddToDevices={handleAddToDevices}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
});

export default AddDeviceModal;
