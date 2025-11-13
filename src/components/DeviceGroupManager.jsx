import { useState, useEffect, useRef } from 'react';

export default function DeviceGroupManager({ devices, onGroupsUpdate }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [draggedGroup, setDraggedGroup] = useState(null);
    const [touchStartY, setTouchStartY] = useState(null);
    const [touchCurrentY, setTouchCurrentY] = useState(null);
    const [isTouchDragging, setIsTouchDragging] = useState(false);
    const [groupForm, setGroupForm] = useState({
        name: '',
        description: '',
        color: '#3B82F6',
        icon: '👤'
    });
    const [schedules, setSchedules] = useState([]);
    const [scheduleForm, setScheduleForm] = useState({
        hour: 9,
        minute: 0,
        ampm: 'AM',
        blockAllow: 'block',
        oneTime: false,
        date: '',
        daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday by default
    });
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    const groupModalRef = useRef();
    const assignModalRef = useRef();
    const scheduleModalRef = useRef();

    // Common emoji options for groups
    const iconOptions = ['👤', '👥', '👨‍👩‍👧‍👦', '👦', '👧', '🏠', '💻', '📱', '🎮', '📺', '🔒', '⭐'];
    const colorOptions = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            console.log('🔍 Fetching device groups...');
            const response = await fetch('/api/device-groups');
            console.log('📡 Response status:', response.status, response.statusText);
            
            if (response.ok) {
                const groupsData = await response.json();
                console.log('✅ Groups fetched successfully:', groupsData);
                setGroups(groupsData);
            } else {
                const errorText = await response.text();
                console.error('❌ Error fetching groups: HTTP', response.status, response.statusText);
                console.error('📄 Response body:', errorText);
            }
        } catch (error) {
            console.error('❌ Error fetching groups:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = () => {
        setEditingGroup(null);
        setGroupForm({
            name: '',
            description: '',
            color: '#3B82F6',
            icon: '👤'
        });
        setShowGroupModal(true);
        groupModalRef.current?.showModal();
    };

    const handleEditGroup = (group) => {
        setEditingGroup(group);
        setGroupForm({
            name: group.name,
            description: group.description || '',
            color: group.color,
            icon: group.icon
        });
        setShowGroupModal(true);
        groupModalRef.current?.showModal();
    };

    const handleSaveGroup = async () => {
        try {
            setLoading(true);
            const url = editingGroup ? `/api/device-groups/${editingGroup.id}` : '/api/device-groups';
            const method = editingGroup ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(groupForm),
            });

            if (response.ok) {
                await fetchGroups();
                handleCloseModal();
                onGroupsUpdate?.();
            }
        } catch (error) {
            console.error('Error saving group:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGroup = async (groupId) => {
        if (!confirm('Are you sure you want to delete this group? Devices will be unassigned but not deleted.')) {
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${groupId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchGroups();
                onGroupsUpdate?.();
            }
        } catch (error) {
            console.error('Error deleting group:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignDevices = (group) => {
        setEditingGroup(group);
        const groupDeviceIds = devices
            ?.filter(device => device.deviceGroupId === group.id)
            ?.map(device => device.id) || [];
        setSelectedDevices(groupDeviceIds);
        assignModalRef.current?.showModal();
    };

    const handleToggleDeviceSelection = (deviceId) => {
        setSelectedDevices(prev => 
            prev.includes(deviceId)
                ? prev.filter(id => id !== deviceId)
                : [...prev, deviceId]
        );
    };

    const handleSaveDeviceAssignments = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${editingGroup.id}/devices`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ deviceIds: selectedDevices }),
            });

            if (response.ok) {
                assignModalRef.current?.close();
                onGroupsUpdate?.();
            }
        } catch (error) {
            console.error('Error updating device assignments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGroupAction = async (groupId, action) => {
        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${groupId}/${action}`, {
                method: 'POST',
            });

            if (response.ok) {
                onGroupsUpdate?.();
            }
        } catch (error) {
            console.error(`Error performing ${action} on group:`, error);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = () => {
        setShowGroupModal(false);
        groupModalRef.current?.close();
    };

    // Schedule management handlers
    const handleManageSchedules = async (group) => {
        setEditingGroup(group);
        await fetchGroupSchedules(group.id);
        setShowScheduleModal(true);
        scheduleModalRef.current?.showModal();
    };

    const fetchGroupSchedules = async (groupId) => {
        try {
            const response = await fetch(`/api/device-groups/${groupId}/schedules`);
            if (response.ok) {
                const schedulesData = await response.json();
                setSchedules(schedulesData);
            }
        } catch (error) {
            console.error('Error fetching group schedules:', error);
        }
    };

    const handleCreateSchedule = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${editingGroup.id}/schedules`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...scheduleForm,
                    modifiedDaysOfTheWeek: scheduleForm.daysOfWeek
                }),
            });

            if (response.ok) {
                await fetchGroupSchedules(editingGroup.id);
                setScheduleForm({
                    hour: 9,
                    minute: 0,
                    ampm: 'AM',
                    blockAllow: 'block',
                    oneTime: false,
                    date: '',
                    daysOfWeek: [1, 2, 3, 4, 5]
                });
            }
        } catch (error) {
            console.error('Error creating schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSchedule = async (scheduleId) => {
        if (!confirm('Are you sure you want to delete this schedule?')) {
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${editingGroup.id}/schedules/${scheduleId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchGroupSchedules(editingGroup.id);
            }
        } catch (error) {
            console.error('Error deleting schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleSchedule = async (scheduleId, currentToggle) => {
        try {
            setLoading(true);
            const response = await fetch(`/api/device-groups/${editingGroup.id}/schedules/${scheduleId}/toggle`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ toggleSched: !currentToggle }),
            });

            if (response.ok) {
                await fetchGroupSchedules(editingGroup.id);
            }
        } catch (error) {
            console.error('Error toggling schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseScheduleModal = () => {
        setShowScheduleModal(false);
        scheduleModalRef.current?.close();
    };

    const formatScheduleTime = (hour, minute, ampm) => {
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatScheduleDays = (days) => {
        if (!days) return 'Daily';
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const selectedDays = days.split('').map(d => dayNames[parseInt(d)]);
        return selectedDays.join(', ');
    };

    const toggleGroupExpansion = (groupId) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupId)) {
                newSet.delete(groupId);
            } else {
                newSet.add(groupId);
            }
            return newSet;
        });
    };

    const getDeviceCount = (groupId) => {
        return devices?.filter(device => device.deviceGroupId === groupId)?.length || 0;
    };

    const getGroupBlockStatus = (groupId) => {
        const groupDevices = devices?.filter(device => device.deviceGroupId === groupId) || [];
        if (groupDevices.length === 0) return false;
        // Return true if ANY device in group is blocked (active: false)
        return groupDevices.some(device => !device.active);
    };

    // Get accent border color for group cards based on status
    const getGroupAccentColor = (groupId) => {
        const deviceCount = getDeviceCount(groupId);
        
        // Grey for empty groups
        if (deviceCount === 0) {
            return '#6B7280'; // gray-500
        }
        
        // Status-based colors for groups with devices
        const isBlocked = getGroupBlockStatus(groupId);
        if (isBlocked) {
            return '#EF4444'; // red-500 - some devices blocked
        } else {
            return '#10B981'; // green-500 - all devices active
        }
    };

    const handleDragStart = (e, groupId) => {
        setDraggedGroup(groupId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetGroupId) => {
        e.preventDefault();
        
        if (!draggedGroup || draggedGroup === targetGroupId) {
            setDraggedGroup(null);
            return;
        }

        const draggedIndex = groups.findIndex(g => g.id === draggedGroup);
        const targetIndex = groups.findIndex(g => g.id === targetGroupId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedGroup(null);
            return;
        }

        const newGroups = [...groups];
        const [draggedItem] = newGroups.splice(draggedIndex, 1);
        newGroups.splice(targetIndex, 0, draggedItem);
        
        setGroups(newGroups);
        setDraggedGroup(null);
    };

    // Touch handlers for mobile drag and drop
    const handleTouchStart = (e, groupId) => {
        const touch = e.touches[0];
        setTouchStartY(touch.clientY);
        setDraggedGroup(groupId);
        setIsTouchDragging(false);
        
        // Prevent scrolling while potentially dragging
        e.preventDefault();
    };

    const handleTouchMove = (e, groupId) => {
        if (!draggedGroup || draggedGroup !== groupId) return;
        
        const touch = e.touches[0];
        setTouchCurrentY(touch.clientY);
        
        // Start dragging if moved enough
        if (!isTouchDragging && touchStartY && Math.abs(touch.clientY - touchStartY) > 10) {
            setIsTouchDragging(true);
        }
        
        e.preventDefault();
    };

    const handleTouchEnd = (e, groupId) => {
        if (!isTouchDragging || !draggedGroup || draggedGroup !== groupId) {
            setDraggedGroup(null);
            setIsTouchDragging(false);
            setTouchStartY(null);
            setTouchCurrentY(null);
            return;
        }

        // Find the group card element under the touch point
        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const groupCard = elementBelow?.closest('[data-group-id]');
        
        if (groupCard) {
            const targetGroupId = parseInt(groupCard.getAttribute('data-group-id'));
            if (targetGroupId && targetGroupId !== draggedGroup) {
                // Reorder groups
                const draggedIndex = groups.findIndex(g => g.id === draggedGroup);
                const targetIndex = groups.findIndex(g => g.id === targetGroupId);

                if (draggedIndex !== -1 && targetIndex !== -1) {
                    const newGroups = [...groups];
                    const [draggedItem] = newGroups.splice(draggedIndex, 1);
                    newGroups.splice(targetIndex, 0, draggedItem);
                    setGroups(newGroups);
                }
            }
        }

        // Reset touch state
        setDraggedGroup(null);
        setIsTouchDragging(false);
        setTouchStartY(null);
        setTouchCurrentY(null);
    };

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
                {/* Header Section - centered title */}
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Groups</h2>
                </div>

            {/* Groups Display Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                {loading && groups.length === 0 ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <div className="text-4xl mb-2">👥</div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No device groups yet</h3>
                        <p className="text-sm mb-6">Create groups to organize your devices for easier management</p>
                        <button 
                            className="btn btn-primary"
                            onClick={handleCreateGroup}
                            disabled={loading}
                        >
                            <span className="text-lg">+</span>
                            Create First Group
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* New Group Button */}
                        <div className="flex justify-end">
                            <button 
                                className="btn btn-primary btn-sm"
                                onClick={handleCreateGroup}
                                disabled={loading}
                            >
                                <span className="text-lg">+</span>
                                New Group
                            </button>
                        </div>
                        
                        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="font-medium">💡 Tip: Drag and drop groups to reorder them (or hold and drag on mobile)</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map(group => (
                                <div 
                                    key={group.id} 
                                    data-group-id={group.id}
                                    className={`bg-white dark:bg-base-200 rounded-xl shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 select-none overflow-hidden relative ${
                                        draggedGroup === group.id 
                                            ? 'opacity-50 scale-95 transform rotate-2' 
                                            : 'hover:shadow-md cursor-move'
                                    } ${
                                        isTouchDragging && draggedGroup === group.id 
                                            ? 'z-50 shadow-xl' 
                                            : ''
                                    }`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, group.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, group.id)}
                                    onTouchStart={(e) => handleTouchStart(e, group.id)}
                                    onTouchMove={(e) => handleTouchMove(e, group.id)}
                                    onTouchEnd={(e) => handleTouchEnd(e, group.id)}
                                    style={{
                                        touchAction: 'none', // Prevent default touch behaviors
                                        ...(isTouchDragging && draggedGroup === group.id && touchCurrentY && touchStartY ? {
                                            transform: `translateY(${touchCurrentY - touchStartY}px) rotate(2deg)`,
                                            zIndex: 1000
                                        } : {})
                                    }}
                                >
                                    {/* Stylized left accent border using status-based color */}
                                    <div 
                                        className="absolute top-0 left-0 w-1/3 h-1 rounded-tl-xl"
                                        style={{ backgroundColor: getGroupAccentColor(group.id) }}
                                    ></div>
                                    
                                    <div className="p-6 pb-4">
                                    {/* Drag handle for mobile - visible on small screens */}
                                    <div className="flex items-center justify-center mb-2 md:hidden">
                                        <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                                    </div>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                                            {/* Group Icon */}
                                            <div 
                                                className="flex-shrink-0 p-2 rounded-lg"
                                                style={{ 
                                                    backgroundColor: group.color + '20', 
                                                    color: group.color 
                                                }}
                                            >
                                                <span className="text-2xl">{group.icon}</span>
                                            </div>
                                            
                                            {/* Group Info */}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{group.name}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                                    {getDeviceCount(group.id)} devices
                                                </p>
                                                {/* Reserve space for description */}
                                                <div className="mt-1 min-h-5">
                                                    {group.description ? (
                                                        <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                                            {group.description}
                                                        </p>
                                                    ) : (
                                                        <div className="invisible">placeholder</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* More/Less Button (replaces dropdown) */}
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => toggleGroupExpansion(group.id)}
                                            title={expandedGroups.has(group.id) ? "Show Less" : "Show More"}
                                        >
                                            {expandedGroups.has(group.id) ? 'Less' : 'More'}
                                        </button>
                                    </div>
                                    
                                    {/* Quick Actions Row */}
                                    <div className="flex items-center justify-between mt-4">
                                        {/* Main Toggle */}
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                className={`toggle toggle-sm ${
                                                    !getGroupBlockStatus(group.id) ? 'toggle-success' : 'toggle-error'
                                                } ${getDeviceCount(group.id) === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                checked={getDeviceCount(group.id) === 0 ? false : !getGroupBlockStatus(group.id)}
                                                disabled={getDeviceCount(group.id) === 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        handleGroupAction(group.id, 'unblock');
                                                    } else {
                                                        handleGroupAction(group.id, 'block');
                                                    }
                                                }}
                                            />
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                {getDeviceCount(group.id) === 0 
                                                    ? 'No Devices' 
                                                    : getGroupBlockStatus(group.id) 
                                                        ? 'Allow' 
                                                        : 'Block'
                                                }
                                            </span>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center space-x-2">
                                            <button 
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleAssignDevices(group)}
                                                title="Add Devices"
                                            >
                                                <span className="text-lg font-bold">+</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                {expandedGroups.has(group.id) && (
                                    <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                        {/* Group Details */}
                                        <div className="mb-4 text-sm">
                                            <div>
                                                <span className="text-gray-500 dark:text-gray-400">Devices:</span>
                                                <p className="font-medium text-gray-900 dark:text-white mt-1">
                                                    {getDeviceCount(group.id)} device{getDeviceCount(group.id) !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Action Buttons Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                            {/* Management Actions */}
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Management</h4>
                                                <button 
                                                    className="btn btn-outline btn-sm w-full justify-start"
                                                    onClick={() => handleEditGroup(group)}
                                                >
                                                    <span>✏️</span> Edit Group
                                                </button>
                                                <button 
                                                    className="btn btn-outline btn-sm w-full justify-start"
                                                    onClick={() => handleManageSchedules(group)}
                                                >
                                                    <span>⏰</span> Schedule
                                                </button>
                                            </div>

                                            {/* Control Actions */}
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Control</h4>
                                                <button 
                                                    className="btn btn-error btn-outline btn-sm w-full justify-start"
                                                    onClick={() => handleDeleteGroup(group.id)}
                                                >
                                                    <span>🗑️</span> Delete Group
                                                </button>
                                            </div>
                                        </div>

                                        {/* Quick Stats */}
                                        {getDeviceCount(group.id) > 0 && (
                                            <div className="bg-base-100 rounded-lg p-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-500 dark:text-gray-400">Group Status:</span>
                                                    <span className={`font-medium ${
                                                        getGroupBlockStatus(group.id) ? 'text-red-600' : 'text-green-600'
                                                    }`}>
                                                        {getGroupBlockStatus(group.id) ? 'Some devices blocked' : 'All devices active'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Group Creation/Edit Modal */}
            <dialog className="modal" ref={groupModalRef}>
                <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">
                            {editingGroup ? 'Edit Group' : 'Create New Group'}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="label">
                                    <span className="label-text">Group Name</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter group name"
                                    className="input input-bordered w-full"
                                    value={groupForm.name}
                                    onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="label">
                                    <span className="label-text">Description (Optional)</span>
                                </label>
                                <textarea
                                    placeholder="Enter group description"
                                    className="textarea textarea-bordered w-full"
                                    rows="2"
                                    value={groupForm.description}
                                    onChange={(e) => setGroupForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="label">
                                    <span className="label-text">Icon</span>
                                </label>
                                <div className="flex gap-2 flex-wrap">
                                    {iconOptions.map(icon => (
                                        <button
                                            key={icon}
                                            type="button"
                                            className={`btn btn-sm ${groupForm.icon === icon ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => setGroupForm(prev => ({ ...prev, icon }))}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="label">
                                    <span className="label-text">Color</span>
                                </label>
                                <div className="flex gap-2 flex-wrap">
                                    {colorOptions.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            className={`w-8 h-8 rounded-full border-2 ${
                                                groupForm.color === color ? 'border-base-content' : 'border-base-300'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setGroupForm(prev => ({ ...prev, color }))}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="modal-action">
                            <button className="btn btn-ghost" onClick={handleCloseModal}>
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={handleSaveGroup}
                                disabled={!groupForm.name.trim() || loading}
                            >
                                {loading ? 'Saving...' : editingGroup ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={handleCloseModal}>close</button>
                    </form>
                </dialog>

                {/* Device Assignment Modal */}
                <dialog className="modal" ref={assignModalRef}>
                    <div className="modal-box max-w-2xl">
                        <h3 className="font-bold text-lg mb-4">
                            Manage Devices in "{editingGroup?.name}"
                        </h3>
                        
                        <div className="alert alert-info mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <div>
                                <h4 className="font-bold">How to assign devices:</h4>
                                <p className="text-sm">✅ Check the boxes next to devices you want in this group, then click "Save Changes"</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-base-content/60">
                                {selectedDevices.length} of {devices?.length || 0} devices selected
                            </p>
                            <div className="flex gap-2">
                                <button 
                                    className="btn btn-xs btn-outline"
                                    onClick={() => setSelectedDevices(devices?.map(d => d.id) || [])}
                                >
                                    Select All
                                </button>
                                <button 
                                    className="btn btn-xs btn-outline"
                                    onClick={() => setSelectedDevices([])}
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>
                        
                        <div className="max-h-96 overflow-y-auto">
                            {devices?.length === 0 ? (
                                <p className="text-center py-8 text-base-content/60">
                                    No devices available
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {devices?.map(device => {
                                        const isSelected = selectedDevices.includes(device.id);
                                        const isCurrentlyInGroup = device.deviceGroupId === editingGroup?.id;
                                        return (
                                            <div 
                                                key={device.id} 
                                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all cursor-pointer ${
                                                    isSelected 
                                                        ? 'bg-primary/10 border-primary' 
                                                        : 'bg-base-200 border-transparent hover:border-base-300'
                                                }`}
                                                onClick={() => handleToggleDeviceSelection(device.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        className="checkbox checkbox-primary"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleDeviceSelection(device.id)}
                                                    />
                                                    <div>
                                                        <p className="font-medium">{device.name}</p>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm text-base-content/60">{device.macAddress}</p>
                                                            {isCurrentlyInGroup && (
                                                                <span className="badge badge-xs badge-primary">Currently in group</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`badge ${device.active ? 'badge-success' : 'badge-error'}`}>
                                                    {device.active ? 'Active' : 'Blocked'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="modal-action">
                            <button 
                                className="btn btn-ghost" 
                                onClick={() => assignModalRef.current?.close()}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={handleSaveDeviceAssignments}
                                disabled={loading}
                            >
                                {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => assignModalRef.current?.close()}>close</button>
                    </form>
                </dialog>

                {/* Schedule Management Modal */}
                <dialog className="modal" ref={scheduleModalRef}>
                    <div className="modal-box w-11/12 max-w-4xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg">
                                Manage Schedules for "{editingGroup?.name}"
                            </h3>
                            <form method="dialog">
                                <button 
                                    className="btn btn-sm btn-circle btn-ghost"
                                    onClick={handleCloseScheduleModal}
                                >
                                    ✕
                                </button>
                            </form>
                        </div>

                        {/* Create New Schedule Form */}
                        <div className="bg-base-200 rounded-lg p-4 mb-6">
                            <h4 className="font-semibold mb-4">Create New Schedule</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Time inputs */}
                                <div>
                                    <label className="label">
                                        <span className="label-text">Time</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <select 
                                            className="select select-bordered flex-1"
                                            value={scheduleForm.hour}
                                            onChange={(e) => setScheduleForm({...scheduleForm, hour: parseInt(e.target.value)})}
                                        >
                                            {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                        <select 
                                            className="select select-bordered flex-1"
                                            value={scheduleForm.minute}
                                            onChange={(e) => setScheduleForm({...scheduleForm, minute: parseInt(e.target.value)})}
                                        >
                                            {[0, 15, 30, 45].map(m => (
                                                <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                                            ))}
                                        </select>
                                        <select 
                                            className="select select-bordered"
                                            value={scheduleForm.ampm}
                                            onChange={(e) => setScheduleForm({...scheduleForm, ampm: e.target.value})}
                                        >
                                            <option value="AM">AM</option>
                                            <option value="PM">PM</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Action */}
                                <div>
                                    <label className="label">
                                        <span className="label-text">Action</span>
                                    </label>
                                    <select 
                                        className="select select-bordered w-full"
                                        value={scheduleForm.blockAllow}
                                        onChange={(e) => setScheduleForm({...scheduleForm, blockAllow: e.target.value})}
                                    >
                                        <option value="block">Block Devices</option>
                                        <option value="allow">Allow Devices</option>
                                    </select>
                                </div>

                                {/* Schedule Type */}
                                <div>
                                    <label className="label">
                                        <span className="label-text">Type</span>
                                    </label>
                                    <select 
                                        className="select select-bordered w-full"
                                        value={scheduleForm.oneTime}
                                        onChange={(e) => setScheduleForm({...scheduleForm, oneTime: e.target.value === 'true'})}
                                    >
                                        <option value="false">Recurring</option>
                                        <option value="true">One Time</option>
                                    </select>
                                </div>

                                {/* Date for one-time schedules */}
                                {scheduleForm.oneTime && (
                                    <div>
                                        <label className="label">
                                            <span className="label-text">Date</span>
                                        </label>
                                        <input 
                                            type="date"
                                            className="input input-bordered w-full"
                                            value={scheduleForm.date}
                                            onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                                        />
                                    </div>
                                )}

                                {/* Days of week for recurring schedules */}
                                {!scheduleForm.oneTime && (
                                    <div className="md:col-span-2">
                                        <label className="label">
                                            <span className="label-text">Days of Week</span>
                                        </label>
                                        <div className="flex gap-2 flex-wrap">
                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                                                <label key={index} className="cursor-pointer flex items-center gap-1">
                                                    <input 
                                                        type="checkbox"
                                                        className="checkbox checkbox-sm"
                                                        checked={scheduleForm.daysOfWeek.includes(index)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setScheduleForm({
                                                                    ...scheduleForm, 
                                                                    daysOfWeek: [...scheduleForm.daysOfWeek, index].sort()
                                                                });
                                                            } else {
                                                                setScheduleForm({
                                                                    ...scheduleForm, 
                                                                    daysOfWeek: scheduleForm.daysOfWeek.filter(d => d !== index)
                                                                });
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm">{day}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end mt-4">
                                <button 
                                    className="btn btn-primary"
                                    onClick={handleCreateSchedule}
                                    disabled={loading || (scheduleForm.oneTime && !scheduleForm.date) || (!scheduleForm.oneTime && scheduleForm.daysOfWeek.length === 0)}
                                >
                                    {loading ? 'Creating...' : 'Create Schedule'}
                                </button>
                            </div>
                        </div>

                        {/* Existing Schedules */}
                        <div>
                            <h4 className="font-semibold mb-4">Existing Schedules ({schedules.length})</h4>
                            {schedules.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No schedules created yet.</p>
                                    <p className="text-sm">Create a schedule above to automatically control this group.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {schedules.map(schedule => (
                                        <div key={schedule.id} className="bg-base-100 rounded-lg p-4 flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div className={`badge ${schedule.blockAllow === 'block' ? 'badge-error' : 'badge-success'}`}>
                                                        {schedule.blockAllow === 'block' ? 'Block' : 'Allow'}
                                                    </div>
                                                    <span className="font-medium">
                                                        {formatScheduleTime(schedule.hour, schedule.minute, schedule.ampm)}
                                                    </span>
                                                    <span className="text-sm text-gray-500">
                                                        {schedule.oneTime ? `On ${schedule.date}` : formatScheduleDays(schedule.days)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox"
                                                    className="toggle toggle-sm"
                                                    checked={schedule.toggleSched}
                                                    onChange={() => handleToggleSchedule(schedule.id, schedule.toggleSched)}
                                                />
                                                <button 
                                                    className="btn btn-ghost btn-sm text-error"
                                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="modal-action">
                            <form method="dialog">
                                <button className="btn" onClick={handleCloseScheduleModal}>Close</button>
                            </form>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={handleCloseScheduleModal}>close</button>
                    </form>
                </dialog>
            </div>
        </div>
    );
}