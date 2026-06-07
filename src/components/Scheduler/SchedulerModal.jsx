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

    const handleEasyBtnClick = e => {
        e.preventDefault();
        advancedBtnRef.current.className = "btn w-28 bg-base-200 border-none min-h-0 h-8";
        easyBtnRef.current.className = "btn w-28 bg-primary font-bold min-h-0 h-8 text-neutral-content ";
        setScheduleMode("standard");
        reRender();
    };

    const handleAdvancedBtnClick = e => {
        e.preventDefault();
        easyBtnRef.current.className = "btn w-28 bg-base-200 border-none min-h-0 h-8";
        advancedBtnRef.current.className = "btn w-28 bg-primary font-bold min-h-0 h-8 text-neutral-content ";
        setScheduleMode("advanced");
        reRender();
    };

    const triggerRenderCallback = () => {
        triggerRender();
        setChanged(prev => !prev);
    };

    const reRender = () => {
        setRender(prev => !prev);
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
                
                <SelectStandardOrAdvanced 
                    setScheduleMode={setScheduleMode} 
                    reRender={reRender} 
                />
                
                <div className="divider my-2"></div>
                
                {scheduleMode === "standard" ? (
                    <EasySched 
                        triggerRender={triggerRenderCallback} 
                        deviceId={deviceId}
                    />
                ) : (
                    <CronManager 
                        triggerRender={triggerRenderCallback} 
                        deviceId={deviceId}
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