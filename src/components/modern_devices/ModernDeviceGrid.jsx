import { useState, useRef, useEffect } from "react";
import PropTypes from 'prop-types';
import { HiMagnifyingGlass, HiAdjustmentsHorizontal, HiPlus } from "react-icons/hi2";
import { IoMdRefresh } from "react-icons/io";
import ModernDeviceCard from "./ModernDeviceCard";
import ModernDeviceSkeleton from "../skeletons/ModernDeviceSkeleton";
import AddDeviceModal from "../AddDeviceModal";

export default function ModernDeviceGrid({ 
    devices = [], 
    loading, 
    onToggle, 
    onEdit, 
    onDelete,
    onScheduleClick,
    timerCancelled,
    timerHandler,
    handleRenderToggle,
    onManageTags,
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [groupFilter, setGroupFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(true);
    const [filteredDevices, setFilteredDevices] = useState(devices);
    
    const searchRef = useRef();
    const addDeviceModalRef = useRef();

    // Compute unique groups from devices for the group filter dropdown
    const availableGroups = [...new Map(
        devices
            .filter(d => d?.deviceGroup)
            .map(d => [d.deviceGroup.id, d.deviceGroup])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    // Filter devices based on search, status, and group
    useEffect(() => {
        let filtered = [...devices];
        
        // Search filter (includes group/tag name)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(device => 
                device?.name?.toLowerCase().includes(term) ||
                device?.macAddress?.toLowerCase().includes(term) ||
                device?.hostname?.toLowerCase().includes(term) ||
                device?.deviceGroup?.name?.toLowerCase().includes(term)
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

        // Group/tag filter
        if (groupFilter !== 'all') {
            if (groupFilter === 'none') {
                filtered = filtered.filter(device => !device?.deviceGroup);
            } else {
                filtered = filtered.filter(device => device?.deviceGroup?.id === parseInt(groupFilter));
            }
        }
        
        setFilteredDevices(filtered);
    }, [devices, searchTerm, statusFilter, groupFilter]);

    const handleRefresh = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setGroupFilter('all');
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
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-base-content">Devices</h1>
                    {devices.length > 0 && (
                        <span className="badge badge-primary badge-sm ml-1">{devices.length}</span>
                    )}
                </div>
                <button
                    className="btn btn-sm btn-primary gap-1"
                    onClick={() => addDeviceModalRef.current?.open()}
                >
                    <HiPlus className="w-4 h-4" />
                    Add Device
                </button>
            </div>

            {/* Compact status summary */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-sm font-medium text-base-content">
                    {counts.total} total
                </span>
                <span className="badge badge-success gap-1">
                    {counts.allowed} allowed
                </span>
                <span className="badge badge-error gap-1">
                    {counts.blocked} blocked
                </span>
                <span className="badge badge-info gap-1">
                    {counts.bonus} bonus
                </span>
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
                    <div className="bg-base-100 rounded-lg p-4 shadow-sm border border-base-300">
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            {/* Search Input */}
                            <div className="flex-1 relative">
                                <HiMagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/40 w-5 h-5" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search by name, MAC address, or tag..."
                                    className="input input-bordered w-full pl-10 pr-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            {/* Filter Controls */}
                            <div className="flex items-center gap-2 flex-wrap">
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

                                <select
                                    className="select select-bordered min-w-[120px]"
                                    value={groupFilter}
                                    onChange={(e) => setGroupFilter(e.target.value)}
                                >
                                    <option value="all">All Tags</option>
                                    <option value="none">No Tag</option>
                                    {availableGroups.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.icon} {group.name}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    onClick={onManageTags}
                                    className="btn btn-ghost btn-sm gap-1"
                                    title="Manage tags"
                                >
                                    🏷️ Manage Tags
                                </button>
                                
                                <button
                                    onClick={handleRefresh}
                                    className="btn btn-ghost btn-square"
                                    title="Refresh"
                                >
                                    <IoMdRefresh className="w-5 h-5" />
                                </button>

                                <button
                                    onClick={() => { setShowFilters(false); setSearchTerm(''); setStatusFilter('all'); setGroupFilter('all'); }}
                                    className="btn btn-ghost btn-square"
                                    title="Hide search and filters"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Device Count Display */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300">
                            <div className="text-sm text-base-content/60">
                                Showing {filteredDevices.length} of {devices.length} devices
                            </div>
                            {groupFilter !== 'all' && (
                                <div className="text-sm text-base-content/60">
                                    Filtered by tag: <span className="font-medium text-base-content">
                                        {groupFilter === 'none' ? 'No Tag' : availableGroups.find(g => g.id === parseInt(groupFilter))?.name}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Device Grid */}
            {filteredDevices.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-base-content/40 mb-4">
                        <HiMagnifyingGlass className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-base-content mb-2">
                        {searchTerm || statusFilter !== 'all' || groupFilter !== 'all' ? 'No devices found' : 'No devices available'}
                    </h3>
                    <p className="text-base-content/60">
                        {searchTerm || statusFilter !== 'all' || groupFilter !== 'all'
                            ? 'Try adjusting your search or filter criteria.'
                            : 'Devices will appear here when they connect to the network.'
                        }
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                    {filteredDevices.map((device) => (
                        <ModernDeviceCard
                            key={device?.id}
                            device={device}
                            onToggle={onToggle}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onScheduleClick={onScheduleClick}
                            timerCancelled={timerCancelled}
                            timerHandler={timerHandler}
                            handleRenderToggle={handleRenderToggle}
                        />
                    ))}
                </div>
            )}

            {/* Add Device Modal */}
            <AddDeviceModal ref={addDeviceModalRef} onAdded={handleRenderToggle} />
        </div>
    );
}

ModernDeviceGrid.propTypes = {
    devices: PropTypes.array,
    loading: PropTypes.bool,
    onToggle: PropTypes.func,
    onEdit: PropTypes.func,
    onDelete: PropTypes.func,
    onScheduleClick: PropTypes.func,
    timerCancelled: PropTypes.bool,
    timerHandler: PropTypes.func,
    handleRenderToggle: PropTypes.func,
    onManageTags: PropTypes.func,
};
