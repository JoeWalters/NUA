import { useEffect, useRef, useState } from "react";
import CronManager from "../CronManager";
import EasySched from "../EasySched";
import { SelectOptionsComponent } from "./SchedulerComponents/SelectOptionsComponent";
import { SelectStandardOrAdvanced } from "./SchedulerComponents/SelectStandardOrAdvanced";

export default function SchedulerModal({ deviceId, deviceName, isOpen, onClose, triggerRender }) {
    const [scheduleMode, setScheduleMode] = useState("standard");
    const [render, setRender] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState({ name: deviceName });
    const easyBtnRef = useRef(null);
    const advancedBtnRef = useRef(null);
    const [changed, setChanged] = useState(false);
    const [existingSchedules, setExistingSchedules] = useState([]);
    const [loadingSchedules, setLoadingSchedules] = useState(false);

    // Reset child component state when switching modes
    const handleModeSwitch = (newMode) => {
        setScheduleMode(newMode);
        setRender(prev => !prev); // Force re-render of child components to reset their state
    };

    const handleEasyBtnClick = e => {
        e.preventDefault();
        advancedBtnRef.current.className = "btn w-28 bg-base-200 border-none min-h-0 h-8";
        easyBtnRef.current.className = "btn w-28 bg-primary font-bold min-h-0 h-8 text-neutral-content ";
        handleModeSwitch("standard");
    };

    const handleAdvancedBtnClick = e => {
        e.preventDefault();
        easyBtnRef.current.className = "btn w-28 bg-base-200 border-none min-h-0 h-8";
        advancedBtnRef.current.className = "btn w-28 bg-primary font-bold min-h-0 h-8 text-neutral-content ";
        handleModeSwitch("advanced");
    };

    const triggerRenderCallback = () => {
        triggerRender();
        setChanged(prev => !prev);
        fetchExistingSchedules(); // Refresh schedules list after creating/editing
    };

    const reRender = () => {
        setRender(prev => !prev);
    };

    // Fetch existing schedules for the device
    const fetchExistingSchedules = async () => {
        if (!deviceId) return;
        
        setLoadingSchedules(true);
        try {
            const response = await fetch('/getschedules', {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: deviceId })
            });
            
            if (response.ok) {
                const schedules = await response.json();
                setExistingSchedules(Array.isArray(schedules) ? schedules : []);
            } else {
                console.error('Failed to fetch schedules');
                setExistingSchedules([]);
            }
        } catch (error) {
            console.error('Error fetching existing schedules:', error);
            setExistingSchedules([]);
        } finally {
            setLoadingSchedules(false);
        }
    };

    // Handle deleting a schedule
    const handleDeleteSchedule = async (scheduleId) => {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;
        
        try {
            const response = await fetch('/deleteschedule', {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: scheduleId })
            });
            
            if (response.ok) {
                triggerRenderCallback(); // Refresh the list
            } else {
                alert('Failed to delete schedule. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting schedule:', error);
            alert('Error deleting schedule.');
        }
    };

    // Close modal when device ID changes (if needed)
    useEffect(() => {
        if (isOpen) {
            // Fetch device info when modal opens
            const getDeviceData = async () => {
                try {
                    const getDeviceName = await fetch('/getspecificdevice', {
                        method: 'POST',
                        mode: 'cors',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ id: deviceId })
                    });
                    if (getDeviceName.ok) {
                        const devInfo = await getDeviceName.json();
                        setDeviceInfo(devInfo);
                    }
                } catch (error) {
                    console.error('Error fetching device info:', error);
                }
            };
            getDeviceData();
            
            // Fetch existing schedules
            fetchExistingSchedules();
        }
    }, [isOpen, deviceId]);

    if (!isOpen) return null;

    return (
        <dialog id="scheduler-modal" className="modal modal-open">
            <div className="modal-box max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Schedule for "{deviceInfo?.name}"</h2>
                    <button 
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>
                
                <div className="divider"></div>
                
                {/* Existing Schedules List */}
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Existing Schedules</h3>
                    {loadingSchedules ? (
                        <div className="flex justify-center py-4">
                            <span className="loading loading-spinner loading-md"></span>
                        </div>
                    ) : existingSchedules.length === 0 ? (
                        <p className="text-base-content/60 italic">No schedules found for this device.</p>
                    ) : (
                        <div className="max-h-48 overflow-y-auto space-y-2">
                            {existingSchedules.map((schedule, index) => (
                                <div key={schedule.id || index} className="flex justify-between items-center bg-base-200 p-3 rounded-lg">
                                    <div className="flex-1">
                                        <p className="font-medium">
                                            {schedule.cron ? `Cron: ${schedule.cron}` : 
                                             schedule.time ? `One-time/Recurring: ${new Date(schedule.time).toLocaleString()}` : 
                                             'Custom Schedule'}
                                        </p>
                                        <p className="text-sm text-base-content/60">
                                            Type: {schedule.type === 'allow' ? 'Allow' : 'Block'}
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn-xs btn-error"
                                        onClick={() => handleDeleteSchedule(schedule.id)}
                                        aria-label="Delete schedule"
                                    >
                                        Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="divider"></div>
                
                <SelectStandardOrAdvanced 
                    setScheduleMode={setScheduleMode} 
                    reRender={reRender} 
                />
                
                <div className="divider my-2"></div>
                
                {scheduleMode === "standard" ? (
                    <EasySched 
                        key={`easy-${render}`} // Key forces re-mount on mode switch
                        triggerRender={triggerRenderCallback} 
                        deviceId={deviceId}
                        deviceName={deviceInfo?.name}
                    />
                ) : (
                    <CronManager 
                        key={`cron-${render}`} // Key forces re-mount on mode switch
                        triggerRender={triggerRenderCallback} 
                        deviceId={deviceId}
                        deviceName={deviceInfo?.name}
                    />
                )}
                
                <div className="divider my-2"></div>
                
                <div className="flex justify-end gap-2">
                    <button 
                        className="btn btn-ghost"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={onClose}>close</button>
            </form>
        </dialog>
    );
}