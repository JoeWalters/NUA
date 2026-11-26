import { useEffect, useRef, useState } from "react";
import { MdMoreTime } from "react-icons/md";
import { debugLog } from "../../utility_functions/debugMode";
import { useCountdown } from "../providers/useCountdown.js";

export default function BonusTimeButton({ deviceId, timerCancelled, timerHandler, handleRenderToggle, bonusTimeActive, showToast }) {

    const bonusDialogRef = useRef();
    const [submitBtnLoading, setSubmitBtnLoading] = useState(false);
    const [stopLoading, setStopLoading] = useState(false);
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(30);
    const numsCheckArr = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    const minutesArr = (function generateMinutes() {
        let maxMins = 59;
        let arr = [];
        while(maxMins > -1) {
            arr.push(maxMins);
            maxMins--;
        }
        return arr;
    })();
    const timer = t => new Promise(res => setTimeout(res, t));
    // The server sends a remaining-ms duration; keep the absolute deadline and
    // derive the display from the page's shared clock (one interval for all timers).
    const [bonusDeadline, setBonusDeadline] = useState(null);
    const [showAdded, setShowAdded] = useState(false);

    const handleHoursIncDec = e => {
        if (e.target.id === "decrementHours") {
            setHours(prev => Math.max(prev - 1, 0));
        } else if (e.target.id === "incrementHours") {
            setHours(prev => Math.min(prev + 1, 23));
        }
    }
    const handleMinutesIncDec = e => {
        if (e.target.id === "decrementMinutes") {
            setMinutes(prev => Math.max(prev - 1, 0));
        } else if (e.target.id === "incrementMinutes") {
            setMinutes(prev => Math.min(prev + 1, 59));
        }
    }
    const handleInputHoursChange = e => {
        if (!numsCheckArr.includes(parseInt(e.target.value))) {
            setHours(0);
        } else if (parseInt(e.target.value) > 23) {
            setHours(23);
        } else if (parseInt(e.target.value) < 0) {
            setHours(0);
        } else {
            setHours(parseInt(e.target.value))
        }
    }
    const handleInputMinutesChange = e => {
        if (!minutesArr.includes(parseInt(e.target.value))) {
            setMinutes(0);
        } else if (parseInt(e.target.value) > 59) {
            setMinutes(59);
        } else if (parseInt(e.target.value) < 0) {
            setMinutes(0);
        } else {
            setMinutes(parseInt(e.target.value))
        }
    }

    useEffect(() => {
      if (bonusTimeActive === false) {
        setBonusDeadline(null);
      }
    }, [bonusTimeActive]);


    useEffect(() => {
        let isMounted = true;

        if (deviceId) {
            const dataObj = { deviceId: deviceId };
            (async function() {
                try {
                    const retrieveTimes = await fetch("/getbonustimesmap", {
                        method: "POST",
                        mode: "cors",
                        headers: {
                            "Content-Type" : "application/json"
                        },
                        body: JSON.stringify(dataObj)
                    });
                    if (retrieveTimes.status === 200) {
                        const res = await retrieveTimes.json();
                        debugLog('res\t', res);
                        if (isMounted) {
                            setBonusDeadline(res.timer ? Date.now() + res.timer : null);
                        }
                    } else if (retrieveTimes.status === 204) {
                        debugLog("No bonus time data to be retrieved!");
                    }
                } catch (error) {
                    console.error(error);
                }
            })();
        }
        return () => {
            isMounted = false;

        }
    }, [deviceId]);

    // Countdown display comes from the shared clock; on expiry we clear the
    // deadline and ask the parent to refresh, exactly as the old interval did.
    const { remaining: milliTime } = useCountdown(bonusDeadline, () => {
        setBonusDeadline(null);
        handleRenderToggle();
    });

    const handleAddTime = async () => {
        try {
            setSubmitBtnLoading(true);
            const isAdditionalTime = milliTime ? true : false;
            const data = { hours: hours, minutes: minutes, deviceId: deviceId, isAdditionalTime: isAdditionalTime };
            const addBonusTime = await fetch("/addbonustime", {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type" : "application/json"
                },
                body: JSON.stringify(data)
            });
            if (addBonusTime.ok) {
                const response = await addBonusTime.json();
                setBonusDeadline(response.timer ? Date.now() + response.timer : null);
                setHours(0);
                setMinutes(30);
                // Brief visual confirmation, then close the modal
                setShowAdded(true);
                setTimeout(() => {
                    setShowAdded(false);
                    bonusDialogRef.current?.close();
                    handleRenderToggle();
                }, 400);
            } else {
                showToast?.('Failed to add bonus time');
            }
        } catch (error) {
            console.error(error);
            showToast?.('Network error while adding bonus time');
        } finally {
            timer(500).then(() => setSubmitBtnLoading(false));
        }
    }

    const handleStopBonusTime = async () => {
        setStopLoading(true);
        try {
            timerHandler(true);
            const res = await fetch("/deletebonustoggles", {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type" : "application/json"
                },
                body: JSON.stringify({ deviceId: deviceId, cancelTimer: true })
            });
            if (res.ok) {
                setBonusDeadline(null);
                timerHandler(false);
                showToast?.('Bonus time ended');
                handleRenderToggle();
            } else {
                showToast?.('Failed to end bonus time');
            }
        } catch (error) {
            console.error(error);
            showToast?.('Network error while ending bonus time');
        } finally {
            setStopLoading(false);
        }
    }

    return (
        <>
            <button
                type="button"
                className={`btn btn-xs gap-0 ${milliTime ? "btn-info" : "btn-outline btn-info"}`}
                onClick={() => bonusDialogRef.current.showModal()}
                title={milliTime ? "Add more bonus time or stop" : "Give this device bonus time"}
            >
                <MdMoreTime className="w-3.5 h-3.5" />
            </button>

            <dialog ref={bonusDialogRef} className="modal">
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Add Bonus Time</h3>

                    <div className="flex flex-col items-center justify-center gap-4 m-8">
                        <form className="max-w-xs mx-auto">
                            <div className="relative flex items-center max-w-[11rem]">
                                <button type="button" id="decrementHours" onClick={handleHoursIncDec} data-input-counter-decrement="bedrooms-input" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-s-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content z-0 pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 2">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 1h16"/>
                                    </svg>
                                </button>
                                <input type="text" id="bedrooms-input" onChange={handleInputHoursChange} data-input-counter-max="23" className="bg-base-100 border-base-300 text-base-content" placeholder="" value={hours} required />
                                <div className="absolute bottom-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center text-xs text-base-content/50 space-x-1 rtl:space-x-reverse">
                                    <span>Hours</span>
                                </div>
                                <button type="button" id="incrementHours" onClick={handleHoursIncDec} data-input-counter-increment="bedrooms-input" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-e-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content z-0 pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 18">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 1v16M1 9h16"/>
                                    </svg>
                                </button>
                            </div>
                        </form>
                        <form className="max-w-xs mx-auto">
                            <div className="relative flex items-center max-w-[11rem]">
                                <button type="button" id="decrementMinutes" onClick={handleMinutesIncDec} data-input-counter-decrement="bedrooms-input" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-s-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content z-0 pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 2">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 1h16"/>
                                    </svg>
                                </button>
                                <input type="text" id="bedrooms-input" onChange={handleInputMinutesChange} className="bg-base-100 border-base-300 text-base-content" placeholder="" value={minutes} required />
                                <div className="absolute bottom-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center text-xs text-base-content/50 space-x-1 rtl:space-x-reverse">
                                    <span>Minutes</span>
                                </div>
                                <button type="button" id="incrementMinutes" onClick={handleMinutesIncDec} data-input-counter-increment="bedrooms-input" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-e-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content pointer-events-none z-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 18">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 1v16M1 9h16"/>
                                    </svg>
                                </button>
                            </div>
                        </form>
                        {milliTime && (
                            <button
                                type="button"
                                className="btn btn-error btn-outline btn-sm w-full"
                                onClick={handleStopBonusTime}
                                disabled={stopLoading}
                            >
                                {stopLoading
                                    ? <span className="loading loading-spinner w-4 h-4"></span>
                                    : 'Stop Current Timer'}
                            </button>
                        )}
                    </div>
                    <div className="modal-action">
                        <div className="btn btn-primary" onClick={handleAddTime}>
                            {submitBtnLoading ? <span className="loading loading-spinner w-6 h-6 text-success"></span> : 'Add'}
                        </div>
                        <form method="dialog">
                            <button className="btn">Close</button>
                        </form>
                    </div>
                    {showAdded && (
                        <div className="px-6 pb-4 text-center text-success font-semibold">
                            ✓ Bonus time added!
                        </div>
                    )}
                </div>
            </dialog>
        </>
    );
}