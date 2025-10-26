import { useState, useRef, useEffect } from "react";
import { HiMagnifyingGlass, HiAdjustmentsHorizontal } from "react-icons/hi2";
import { IoMdRefresh } from "react-icons/io";
import ModernDeviceCard from "./ModernDeviceCard";
import ModernDeviceSkeleton from "../skeletons/ModernDeviceSkeleton";

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
    
    const searchRef = useRef();

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

            {/* Search and Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    {/* Search Input (collapses to icon) */}
                    <div className="flex-1 relative">
                        {!showSearch ? (
                            <button
                                className="btn btn-ghost btn-square"
                                onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }}
                                title="Search"
                            >
                                <HiMagnifyingGlass className="w-5 h-5" />
                            </button>
                        ) : (
                            <>
                                <HiMagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search by name or MAC address..."
                                    className="input input-bordered w-full pl-10 pr-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <button
                                    className="btn btn-ghost btn-square absolute right-1 top-1/2 transform -translate-y-1/2"
                                    onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                                    title="Close search"
                                >
                                    ✕
                                </button>
                            </>
                        )}
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
                    </div>
                </div>

                {/* Device Count Display */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        Showing {filteredDevices.length} of {devices.length} devices
                    </div>
                </div>
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
        </div>
    );
}