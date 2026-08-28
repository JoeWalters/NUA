import { useRef, useState } from "react";

const delay = (t) => new Promise((res) => setTimeout(res, t));

// Shared device management logic (toggle, delete, edit, block/unblock all,
// scheduler modal, loading + toast state). Extracted so the Devices and
// ModernDevices screens have a single source of truth instead of duplicating
// the same fetch handlers.
//
// `macData`    : the current list of managed devices
// `blockedUsers`: the current list of blocked devices (for block/unblock all)
// `onDataChange`: called after any successful mutation to re-fetch the list
export function useDeviceActions({ macData, blockedUsers, onDataChange }) {
    const [loading, setLoading] = useState(false);
    const [updatedDeviceData, setUpdatedDeviceData] = useState(null);
    const [toggleIsLoading, setToggleIsLoading] = useState(false);
    const [timerCancelled, setTimerCancelled] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    // Scheduler modal state
    const [schedulerOpen, setSchedulerOpen] = useState(false);
    const [selectedDeviceForScheduler, setSelectedDeviceForScheduler] = useState(null);

    const toggleLoadingDialogRef = useRef();
    const deleteConfirmRef = useRef();
    const editRef = useRef();
    const newDeviceNameRef = useRef();
    const newMacAddressRef = useRef();

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 4000);
    };

    const timerHandler = (cancelled) => {
        setTimerCancelled(cancelled);
    };

    const openSchedulerModal = (deviceId, deviceName) => {
        setSelectedDeviceForScheduler({ id: deviceId, name: deviceName });
        setSchedulerOpen(true);
    };

    const closeScheduler = () => {
        setSchedulerOpen(false);
        setSelectedDeviceForScheduler(null);
    };

    const handleToggle = async (deviceId) => {
        try {
            setLoading(true);
            setToggleIsLoading(true);
            toggleLoadingDialogRef.current.showModal();

            const dataToUpdate = macData?.filter((data) => data?.id === parseInt(deviceId));

            const updateToggle = await fetch(`/updatemacaddressstatus`, {
                method: "PUT",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(dataToUpdate[0])
            });

            const result = await updateToggle.json();

            if (updateToggle.ok && result.success) {
                setLoading(false);
                onDataChange?.();

                delay(2000).then(() => {
                    setToggleIsLoading(false);
                    toggleLoadingDialogRef.current.close();
                });
            } else {
                console.error('Toggle failed:', result.error || result.message);
                setLoading(false);
                showToast(`Operation failed: ${result.error || result.message || 'Unknown error'}`);

                delay(2000).then(() => {
                    setToggleIsLoading(false);
                    toggleLoadingDialogRef.current.close();
                });
            }
        } catch (error) {
            console.error('Toggle network error:', error);
            setLoading(false);
            showToast('Network error occurred. Please check your connection and try again.');

            delay(2000).then(() => {
                setToggleIsLoading(false);
                toggleLoadingDialogRef.current.close();
            });
        }
    };

    const handleUnBlockAll = async () => {
        try {
            const data = { macData, blockedUsers };
            const blockAll = await fetch('unblockallmacs', {
                method: "PUT",
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (blockAll.ok) {
                await blockAll.json();
                onDataChange?.();
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleBlockAll = async () => {
        try {
            const data = { macData, blockedUsers };
            const blockAll = await fetch('blockallmacs', {
                method: "PUT",
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (blockAll.ok) {
                await blockAll.json();
                onDataChange?.();
            }
        } catch (error) {
            console.error('Error blocking all devices:', error);
        }
    };

    const handleDelete = (deviceId) => {
        setPendingDeleteId(deviceId);
        deleteConfirmRef.current.showModal();
    };

    const handleConfirmDelete = async () => {
        deleteConfirmRef.current.close();
        if (!pendingDeleteId) return;
        const deviceId = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            const submitForDeletion = await fetch('/removedevice', {
                method: "delete",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ id: deviceId })
            });
            if (submitForDeletion.ok) {
                await submitForDeletion.json();
                onDataChange?.();
            }
        } catch (error) {
            console.error('Error deleting device:', error);
        }
    };

    const openEditDialog = (deviceId) => {
        editRef.current.showModal();
        const selectedDevice = macData?.filter(device => device.id === parseInt(deviceId));
        setUpdatedDeviceData({
            ...selectedDevice[0],
            id: deviceId
        });
    };

    const handleClose = () => {
        editRef.current.close();
        newDeviceNameRef.current.value = '';
        newMacAddressRef.current.value = '';
    };

    const handleEditInput = (e) => {
        setUpdatedDeviceData({
            ...updatedDeviceData,
            [e.target.name]: e.target.value
        });
    };

    const handleSaveEdits = () => {
        setLoading(true);
        const updateEdits = async () => {
            try {
                const updates = await fetch('/updatedevicedata', {
                    method: 'PUT',
                    mode: 'cors',
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(updatedDeviceData)
                });
                if (updates.ok) {
                    await updates.json();
                    setLoading(false);
                    onDataChange?.();
                    editRef.current.close();
                    newDeviceNameRef.current.value = '';
                    newMacAddressRef.current.value = '';
                }
            } catch (error) {
                setLoading(false);
                console.error(error);
            }
        };
        updateEdits();
    };

    return {
        loading,
        updatedDeviceData,
        toggleIsLoading,
        timerCancelled,
        toastMessage,
        pendingDeleteId,
        schedulerOpen,
        selectedDeviceForScheduler,
        editRef,
        deleteConfirmRef,
        toggleLoadingDialogRef,
        newDeviceNameRef,
        newMacAddressRef,
        timerHandler,
        showToast,
        openSchedulerModal,
        closeScheduler,
        handleToggle,
        handleDelete,
        handleConfirmDelete,
        openEditDialog,
        handleClose,
        handleEditInput,
        handleSaveEdits,
        handleBlockAll,
        handleUnBlockAll,
    };
}
