import { useState, useRef, useEffect } from "react";
import { HiMagnifyingGlass, HiAdjustmentsHorizontal } from "react-icons/hi2";
import { IoMdRefresh } from "react-icons/io";
import ModernDeviceCard from "./ModernDeviceCard";
import ModernDeviceSkeleton from "../skeletons/ModernDeviceSkeleton";
import useFetchAllDevices from "../all_devices/useFetchAllDevices";
import AllDevicesCard from "../all_devices/AllDevicesCard";

export default function ModernDeviceGrid({ 
    devices = [], 
    loading, 
    onToggle, 
    onEdit, 
    onDelete,
    timerCancelled,
    timerHandler,
    handleRenderToggle,
    onBlockAll,
    onUnblockAll
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [filteredDevices, setFilteredDevices] = useState(devices);
    
    // Add Device Modal state
    const [allDevicesFilter, setAllDevicesFilter] = useState('all');
    const [allDevicesSearch, setAllDevicesSearch] = useState('');
    const [filteredAllDevices, setFilteredAllDevices] = useState([]);
    
    const searchRef = useRef();
    const allDevicesSearchRef = useRef();
    const allDevicesSelectRef = useRef();
    
    // Fetch all devices for the modal
    const { clientDevices, deviceList, loading: allDevicesLoading, reFetch } = useFetchAllDevices();

    // Filter devices based on search and status
    useEffect(() => {
        let filtered = [...devices];
        
        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(device => 
                device?.name?.toLowerCase().includes(term) ||
                device?.macAddress?.toLowerCase().includes(term) ||
                device?.hostname?.toLowerCase().includes(term)
            );
        }
        
        // Status filter
        switch (statusFilter) {
            case 'allowed':
                filtered = filtered.filter(device => device?.active === true);
                break;
            case 'blocked':
                filtered = filtered.filter(device => device?.active === false);
                break;
            case 'bonus':
                filtered = filtered.filter(device => device?.bonusTimeActive === true);
                break;
            default:
                break;
        }
        
        setFilteredDevices(filtered);
    }, [devices, searchTerm, statusFilter]);

    const handleRefresh = () => {
        setSearchTerm('');
        setStatusFilter('all');
        if (searchRef.current) {
            searchRef.current.value = '';
        }
        handleRenderToggle();
    };

    const getStatusCounts = () => {
        const total = devices.length;
        const allowed = devices.filter(d => d?.active === true).length;
        const blocked = devices.filter(d => d?.active === false).length;
        const bonus = devices.filter(d => d?.bonusTimeActive === true).length;
        
        return { total, allowed, blocked, bonus };
    };

    const counts = getStatusCounts();

    // AllDevices modal functions
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
                const returnData = await response.json();
                console.log('Device added successfully', returnData);
                reFetch();
                handleRenderToggle(); // Refresh the main device list
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
        
        // Search filter
        if (allDevicesSearch) {
            const term = allDevicesSearch.toLowerCase();
            filtered = filtered.filter(device => 
                device?.name?.toLowerCase().includes(term) ||
                device?.oui?.toLowerCase().includes(term) ||
                device?.mac?.toLowerCase().includes(term) ||
                device?.hostname?.toLowerCase().includes(term)
            );
        }
        
        // Status filter
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

    if (loading) {
        return <ModernDeviceSkeleton count={6} />;
    }

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Device Management
                </h1>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{counts.total}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Devices</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-2xl font-bold text-green-600">{counts.allowed}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Allowed</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-2xl font-bold text-red-600">{counts.blocked}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Blocked</div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="text-2xl font-bold text-blue-600">{counts.bonus}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Bonus Time</div>
                </div>
            </div>

            {/* Add Device Button */}
            <div className="text-center mb-6">
                <button 
                    className="btn btn-primary"
                    onClick={() => document.getElementById('addDeviceModal').showModal()}
                >
                    <span className="text-lg">+</span>
                    Add Device
                </button>
            </div>

            {/* Search and Filter Bar - Compact */}
            <div className="mb-6">
                {!showFilters ? (
                    <div className="text-center">
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowFilters(true)}
                            title="Show search and filters"
                        >
                            <HiMagnifyingGlass className="w-4 h-4 mr-2" />
                            <HiAdjustmentsHorizontal className="w-4 h-4 mr-2" />
                            Search & Filter
                        </button>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            {/* Search Input */}
                            <div className="flex-1 relative">
                                <HiMagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search by name or MAC address..."
                                    className="input input-bordered w-full pl-10 pr-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            {/* Filter Controls */}
                            <div className="flex items-center gap-2">
                                <select
                                    className="select select-bordered min-w-[120px]"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="all">All Devices</option>
                                    <option value="allowed">Allowed</option>
                                    <option value="blocked">Blocked</option>
                                    <option value="bonus">Bonus Time</option>
                                </select>
                                
                                <button
                                    onClick={handleRefresh}
                                    className="btn btn-ghost btn-square"
                                    title="Refresh"
                                >
                                    <IoMdRefresh className="w-5 h-5" />
                                </button>

                                <button
                                    onClick={() => { setShowFilters(false); setSearchTerm(''); setStatusFilter('all'); }}
                                    className="btn btn-ghost btn-square"
                                    title="Hide search and filters"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Device Count Display */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Showing {filteredDevices.length} of {devices.length} devices
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Device Grid */}
            {filteredDevices.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                        <HiMagnifyingGlass className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        {searchTerm || statusFilter !== 'all' ? 'No devices found' : 'No devices available'}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        {searchTerm || statusFilter !== 'all' 
                            ? 'Try adjusting your search or filter criteria.'
                            : 'Devices will appear here when they connect to the network.'
                        }
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredDevices.map((device) => (
                        <ModernDeviceCard
                            key={device?.id}
                            device={device}
                            onToggle={onToggle}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            timerCancelled={timerCancelled}
                            timerHandler={timerHandler}
                            handleRenderToggle={handleRenderToggle}
                        />
                    ))}
                </div>
            )}

            {/* Add Device Modal */}
            <dialog id="addDeviceModal" className="modal">
                <div className="modal-box w-11/12 max-w-5xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Add Device to Management</h3>
                        <form method="dialog">
                            <button className="btn btn-sm btn-circle btn-ghost">✕</button>
                        </form>
                    </div>
                    
                    {/* Search and Filter Bar for All Devices */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                        <div className="flex-1">
                            <input
                                ref={allDevicesSearchRef}
                                type="text"
                                placeholder="Search by name, MAC, hostname, or OUI..."
                                className="input input-bordered w-full"
                                onChange={handleAllDevicesSearch}
                            />
                        </div>
                        <div className="flex gap-2">
                            <select 
                                ref={allDevicesSelectRef}
                                className="select select-bordered w-full sm:w-auto"
                                onChange={handleAllDevicesFilterChange}
                                value={allDevicesFilter}
                            >
                                <option value="all">All Devices</option>
                                <option value="Not on Device List">Not on Device List</option>
                                <option value="Online Devices">Online Devices</option>
                                <option value="Offline Devices">Offline Devices</option>
                                <option value="Blocked Devices">Blocked Devices</option>
                            </select>
                            <button 
                                className="btn btn-outline"
                                onClick={handleAllDevicesRefresh}
                            >
                                <IoMdRefresh className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* All Devices Grid */}
                    <div className="max-h-96 overflow-y-auto">
                        {allDevicesLoading ? (
                            <div className="flex justify-center py-8">
                                <span className="loading loading-spinner loading-md"></span>
                            </div>
                        ) : filteredAllDevices.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <p>No devices found matching your criteria.</p>
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

                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn">Close</button>
                        </form>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </div>
    );
}