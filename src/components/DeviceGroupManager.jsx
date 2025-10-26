import { useState, useEffect, useRef } from 'react';

export default function DeviceGroupManager({ devices, onGroupsUpdate }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [draggedGroup, setDraggedGroup] = useState(null);
    const [groupForm, setGroupForm] = useState({
        name: '',
        description: '',
        color: '#3B82F6',
        icon: '👤'
    });

    const groupModalRef = useRef();
    const assignModalRef = useRef();

    // Common emoji options for groups
    const iconOptions = ['👤', '👥', '👨‍👩‍👧‍👦', '🏠', '💻', '📱', '🎮', '📺', '🔒', '⭐'];
    const colorOptions = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/device-groups');
            if (response.ok) {
                const groupsData = await response.json();
                setGroups(groupsData);
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
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

    const getDeviceCount = (groupId) => {
        return devices?.filter(device => device.deviceGroupId === groupId)?.length || 0;
    };

    const getGroupBlockStatus = (groupId) => {
        const groupDevices = devices?.filter(device => device.deviceGroupId === groupId) || [];
        if (groupDevices.length === 0) return false;
        // Return true if ANY device in group is blocked (active: false)
        return groupDevices.some(device => !device.active);
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

    return (
        <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="card-title text-2xl">
                        <span className="text-2xl">👥</span>
                        Device Groups
                    </h2>
                    <button 
                        className="btn btn-primary btn-sm"
                        onClick={handleCreateGroup}
                        disabled={loading}
                    >
                        <span className="text-lg">+</span>
                        New Group
                    </button>
                </div>

                {loading && groups.length === 0 ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-8 text-base-content/60">
                        <div className="text-4xl mb-2">👥</div>
                        <p>No device groups yet</p>
                        <p className="text-sm">Create groups to organize your devices</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="alert alert-info">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>💡 <strong>Tip:</strong> Drag and drop groups to reorder them</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map(group => (
                                <div 
                                    key={group.id} 
                                    className={`card bg-base-200 shadow-sm transition-all cursor-move ${
                                        draggedGroup === group.id ? 'opacity-50 scale-95' : 'hover:shadow-md'
                                    }`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, group.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, group.id)}
                                >
                                    <div className="card-body p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span 
                                                className="text-2xl p-2 rounded-lg"
                                                style={{ backgroundColor: group.color + '20' }}
                                            >
                                                {group.icon}
                                            </span>
                                            <div>
                                                <h3 className="font-semibold">{group.name}</h3>
                                                <p className="text-xs text-base-content/60">
                                                    {getDeviceCount(group.id)} devices
                                                </p>
                                            </div>
                                        </div>
                                        <div className="dropdown dropdown-end">
                                            <label tabIndex={0} className="btn btn-ghost btn-xs">
                                                <span className="text-lg">⋯</span>
                                            </label>
                                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                                                <li key={`edit-${group.id}`}>
                                                    <button onClick={() => handleEditGroup(group)}>
                                                        <span>✏️</span> Edit Group
                                                    </button>
                                                </li>
                                                <li key={`manage-${group.id}`}>
                                                    <button onClick={() => handleAssignDevices(group)}>
                                                        <span>📱</span> Manage Devices
                                                    </button>
                                                </li>
                                                <div key={`divider1-${group.id}`} className="divider my-1"></div>
                                                <li key={`block-${group.id}`}>
                                                    <button 
                                                        onClick={() => handleGroupAction(group.id, 'block')}
                                                        className="text-error"
                                                    >
                                                        <span>🚫</span> Block All
                                                    </button>
                                                </li>
                                                <li key={`unblock-${group.id}`}>
                                                    <button 
                                                        onClick={() => handleGroupAction(group.id, 'unblock')}
                                                        className="text-success"
                                                    >
                                                        <span>✅</span> Unblock All
                                                    </button>
                                                </li>
                                                <div key={`divider2-${group.id}`} className="divider my-1"></div>
                                                <li key={`delete-${group.id}`}>
                                                    <button 
                                                        onClick={() => handleDeleteGroup(group.id)}
                                                        className="text-error"
                                                    >
                                                        <span>🗑️</span> Delete Group
                                                    </button>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                    
                                    {group.description && (
                                        <p className="text-sm text-base-content/70 mb-2">
                                            {group.description}
                                        </p>
                                    )}

                                    <div className="flex gap-2 flex-wrap items-center justify-between">
                                        <button 
                                            className="btn btn-xs btn-outline"
                                            onClick={() => handleAssignDevices(group)}
                                        >
                                            📱 Manage Devices
                                        </button>
                                        
                                        {/* Group Toggle - matching device card style */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-base-content/60">
                                                {getGroupBlockStatus(group.id) ? 'Some Blocked' : 'All Active'}:
                                            </span>
                                            <input
                                                type="checkbox"
                                                className={`toggle toggle-sm ${
                                                    getGroupBlockStatus(group.id) ? 'toggle-error' : 'toggle-success'
                                                }`}
                                                checked={getGroupBlockStatus(group.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        handleGroupAction(group.id, 'block');
                                                    } else {
                                                        handleGroupAction(group.id, 'unblock');
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                )}

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
            </div>
        </div>
    );
}