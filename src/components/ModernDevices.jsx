import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ModernDeviceGrid from "./modern_devices/ModernDeviceGrid";
import LoadingDialog from "./utility_components/LoadingDialog";

export default function ModernDevices({ macData, blockedUsers, handleRenderToggle, loadingMacData }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const editRef = useRef();
    const [updatedDeviceData, setUpdatedDeviceData] = useState(null);
    const [toggleIsLoading, setToggleIsLoading] = useState(false);
    const [timerCancelled, setTimerCancelled] = useState(false);
    
    const toggleLoadingDialogRef = useRef();
    const newDeviceNameRef = useRef();
    const newMacAddressRef = useRef();

    function timerHandler(cancelled) {
        setTimerCancelled(cancelled);
    }

    function handleToggleIsLoading() {
        if (toggleIsLoading) {
            toggleLoadingDialogRef.current.showModal();
        } else if (!toggleIsLoading) {
            toggleLoadingDialogRef.current.close();
        }
    }

    const delay = t => new Promise(res => setTimeout(res, t));

    useEffect(() => {
        console.log('useEffect in modern devices fired...');
        console.log("Data from modern devices upon hopeful re-render:\t", macData);
    }, [macData]);

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
                console.log('Toggle successful:', result);
                setLoading(false);
                handleRenderToggle();

                delay(2000).then(() => {
                    setToggleIsLoading(false);
                    toggleLoadingDialogRef.current.close();
                });
            } else {
                console.error('Toggle failed:', result.error || result.message);
                setLoading(false);
                alert(`Operation failed: ${result.error || result.message || 'Unknown error'}`);
                
                delay(2000).then(() => {
                    setToggleIsLoading(false);
                    toggleLoadingDialogRef.current.close();
                });
            }
        } catch (error) {
            console.error('Toggle network error:', error);
            setLoading(false);
            alert('Network error occurred. Please check your connection and try again.');

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
                const updatedData = await blockAll.json();
                console.log('All Devices Unblocked: ', updatedData);
                handleRenderToggle();
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
                const updatedData = await blockAll.json();
                console.log('All Devices Blocked response: ', updatedData);
                handleRenderToggle();
            }
        } catch (error) {
            if (error) throw error;
        }
    };

    const handleDelete = async (deviceId) => {
        // Show confirmation dialog
        if (!confirm('Are you sure you want to delete this device? This action cannot be undone.')) {
            return;
        }

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
                const confirmation = await submitForDeletion.json();
                console.log(confirmation);
                handleRenderToggle();
            }
        } catch (error) {
            if (error) throw error;
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

    const handleEditInput = e => {
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
                    const response = updates.json();
                    console.log(response);
                    setLoading(false);
                    handleRenderToggle();
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

    return (
        <>
            <ModernDeviceGrid
                devices={macData}
                loading={loadingMacData}
                onToggle={handleToggle}
                onEdit={openEditDialog}
                onDelete={handleDelete}
                timerCancelled={timerCancelled}
                timerHandler={timerHandler}
                handleRenderToggle={handleRenderToggle}
                onBlockAll={handleBlockAll}
                onUnblockAll={handleUnBlockAll}
            />

            {/* Edit Device Modal */}
            <dialog className="modal" ref={editRef}>
                <div className="modal-box">
                    <h3 className="font-bold text-lg mb-4">Edit Device</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="label">
                                <span className="label-text">Device Name</span>
                            </label>
                            <input
                                ref={newDeviceNameRef}
                                type="text"
                                name="name"
                                placeholder="Enter device name"
                                className="input input-bordered w-full"
                                defaultValue={updatedDeviceData?.name || ''}
                                onChange={handleEditInput}
                            />
                        </div>
                        
                        <div>
                            <label className="label">
                                <span className="label-text">MAC Address</span>
                            </label>
                            <input
                                ref={newMacAddressRef}
                                type="text"
                                name="macAddress"
                                placeholder="Enter MAC address"
                                className="input input-bordered w-full"
                                defaultValue={updatedDeviceData?.macAddress || ''}
                                onChange={handleEditInput}
                            />
                        </div>
                    </div>

                    <div className="modal-action">
                        <button 
                            className="btn btn-ghost" 
                            onClick={handleClose}
                        >
                            Cancel
                        </button>
                        <button 
                            className="btn btn-primary"
                            onClick={handleSaveEdits}
                            disabled={loading}
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button onClick={handleClose}>close</button>
                </form>
            </dialog>

            <LoadingDialog toggleLoadingDialogRef={toggleLoadingDialogRef} />
        </>
    );
}