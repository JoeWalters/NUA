import { useEffect, useRef, useState } from "react";
import CronManager from "../CronManager";
import EasySched from "../EasySched";
import ScheduleData from "./ScheduleData";
import { SelectStandardOrAdvanced } from "./SchedulerComponents/SelectStandardOrAdvanced";

export default function SchedulerModal({ deviceId, deviceName, isOpen, onClose, triggerRender }) {
    const [scheduleMode, setScheduleMode] = useState("standard");
    const [render, setRender] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState({ name: deviceName });
    const [changed, setChanged] = useState(false);
    const closeButtonRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    const triggerRenderCallback = () => {
        triggerRender();
        setChanged(prev => !prev);
    };

    const reRender = () => {
        setRender(prev => !prev);
    };

    useEffect(() => {
        if (isOpen) {
            previousActiveElementRef.current = document.activeElement;
            // Defer focus until modal content is mounted.
            const timerId = setTimeout(() => {
                closeButtonRef.current?.focus();
            }, 0);
            return () => clearTimeout(timerId);
        }

        const previousActive = previousActiveElementRef.current;
        if (previousActive && typeof previousActive.focus === "function") {
            previousActive.focus();
        }
    }, [isOpen]);

    // Close modal when device ID changes (if needed)
    useEffect(() => {
        if (!isOpen) return;

        const controller = new AbortController();

        // Fetch device info when modal opens
        const getDeviceData = async () => {
            try {
                const getDeviceName = await fetch('/getspecificdevice', {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: deviceId }),
                    signal: controller.signal
                });
                if (getDeviceName.ok) {
                    const devInfo = await getDeviceName.json();
                    setDeviceInfo(devInfo);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error fetching device info:', error);
                }
            }
        };

        getDeviceData();

        return () => {
            controller.abort();
        };
    }, [isOpen, deviceId]);

    if (!isOpen) return null;

    return (
        <dialog
            id="scheduler-modal"
            className="modal modal-open"
            aria-modal="true"
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
        >
            <div className="modal-box max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Schedule for "{deviceInfo?.name}"</h2>
                    <button 
                        ref={closeButtonRef}
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={onClose}
                        aria-label="Close scheduler modal"
                    >
                        ✕
                    </button>
                </div>
                
                <div className="divider"></div>
                
                {/* Existing Schedules List */}
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Existing Schedules</h3>
                    <ScheduleData changed={changed} deviceId={deviceId} />
                </div>
                
                <div className="divider"></div>
                
                <SelectStandardOrAdvanced 
                    scheduleMode={scheduleMode}
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
                <button type="button" onClick={onClose} aria-label="Close scheduler modal">close</button>
            </form>
        </dialog>
    );
}