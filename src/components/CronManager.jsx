import { useEffect, useRef, useState } from "react";
import { GoInfo } from "react-icons/go";
import { NETWORK_ERROR_MESSAGE, responseErrorMessage } from "./utility_functions/response_error_message";
import { describeCron } from "../utility_functions/describeCron";

export default function CronManager({ triggerRender, deviceId }) {
    const [cron, setCron] = useState({
        crontype: 'allow',
        id: deviceId ? parseInt(deviceId) : null,
        toggleCron: true,
        jobName: '',
        croninput: ''
    });

    const inputRef = useRef();
    const [invalidCronMessage, setInvalidCronMessage] = useState({});
    
    // Update state when deviceId prop changes
    useEffect(() => {
        if (deviceId) {
            setCron(prev => ({
                ...prev,
                id: parseInt(deviceId)
            }));
        }
    }, [deviceId]);

    const handleAllow = e => {
        setCron({
            ...cron,
            crontype: e.target.value
        })
    }

    const handleBlock = e => {
        setCron({
            ...cron,
            crontype: e.target.value
        });
    }

    const handleCronData = e => {
        setCron({
            ...cron,
            id: cron.id,
            [e.target.name]: e.target.value
        })
    }

    const handleSubmit = async () => {
        setInvalidCronMessage({});
        if (!cron.id) {
            setInvalidCronMessage({ error: true, message: "Device ID is missing!" });
            return;
        }

        if (!cron.croninput || cron.croninput.trim() === '') {
            setInvalidCronMessage({ error: true, message: "Please enter a valid cron expression!" });
            return;
        }

        // Catch a malformed expression here instead of after a failed round trip.
        const described = describeCron(cron.croninput);
        if (!described.valid) {
            setInvalidCronMessage({ error: true, message: described.error });
            return;
        }

        try {
            const submitData = await fetch('/addschedule', {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ ...cron, cron: cron.croninput })
            });
            
            if (submitData.ok) {
                setInvalidCronMessage({ error: false });
                const results = await submitData.json();
                console.log(results);
                if (inputRef.current) inputRef.current.value = '';
                setCron(prev => ({ ...prev, croninput: '' }));
                triggerRender();
            } else {
                const fallback = submitData.status === 422
                    ? "Failed to create schedule. Please try again."
                    : `Failed to create schedule (server said ${submitData.status}). Please try again.`;
                const message = await responseErrorMessage(submitData, fallback);
                setInvalidCronMessage({ error: true, message });
            }
        } catch (e) {
            console.error(e);
            setInvalidCronMessage({ error: true, message: NETWORK_ERROR_MESSAGE });
        }
    }
    
    return (
        <>
            <div className="flex mt-8">
                <a href="https://cron.help" target="_blank" rel="noreferrer" className="link hover:text-info">
                    <GoInfo />
                </a>
            </div>
            
            <div className="flex items-center justify-center flex-col">
                <div className="flex flex-col">
                    <div className="flex justify-center items-center gap-4">
                        <div className="flex flex-row my-2">
                            <input
                                className={`input input-bordered italic ${invalidCronMessage.error ? 'border-error' : ''}`}
                                name="croninput"
                                ref={inputRef}
                                placeholder="*/5 * * * *"
                                onChange={e => handleCronData(e)}
                            />
                        </div>
                    </div>
                    
                    {(() => {
                        if (!cron.croninput.trim()) return null;
                        const described = describeCron(cron.croninput);
                        return (
                            <div
                                className={`text-center text-sm mt-1 mb-1 ${described.valid ? 'opacity-70' : 'text-error'}`}
                                aria-live="polite"
                            >
                                {described.valid ? `Runs: ${described.description}` : described.error}
                            </div>
                        );
                    })()}

                    <div className="flex items-center justify-center gap-4 my-2">
                        <label className="label cursor-pointer">
                            <span className="label-text">Allow</span>
                            <input 
                                type="radio" 
                                name="crontype" 
                                value="allow" 
                                checked={cron.crontype === 'allow'} 
                                onChange={handleAllow} 
                                className="radio radio-success radio-sm"
                            />
                        </label>
                        <label className="label cursor-pointer">
                            <span className="label-text">Block</span>
                            <input 
                                type="radio" 
                                name="crontype" 
                                value="block" 
                                checked={cron.crontype === 'block'} 
                                onChange={handleBlock} 
                                className="radio radio-error radio-sm"
                            />
                        </label>
                    </div>

                    <div className="flex justify-center mt-2">
                        <button 
                            className="btn btn-primary btn-sm w-full max-w-xs" 
                            onClick={handleSubmit}
                        >
                            Submit Schedule
                        </button>
                    </div>
                </div>
            </div>

            {invalidCronMessage.error && (
                <div role="alert" className="alert alert-error mt-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{invalidCronMessage.message}</span>
                </div>
            )}
        </>
    );
}
