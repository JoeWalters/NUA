import { useEffect, useId, useRef, useState } from "react";
import { MdMoreTime } from "react-icons/md";
import { useCountdown } from "../providers/useCountdown.js";

export default function RuleBonusTimeButton({ trafficRuleId, bonusTimeActive, onStateChange }) {
    const bonusDialogRef = useRef();
    // Unique per instance: two bonus-time controls can be on screen at once.
    const stepperId = useId();
    const hoursInputId = `bonus-hours-${stepperId}`;
    const minutesInputId = `bonus-minutes-${stepperId}`;
    const [submitBtnLoading, setSubmitBtnLoading] = useState(false);
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(30);
    // Absolute deadline derived from the server's remaining-ms duration; the
    // display ticks off the page's shared clock.
    const [bonusDeadline, setBonusDeadline] = useState(null);
    const [showAdded, setShowAdded] = useState(false);

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

    const handleHoursIncDec = (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === "decrement") {
            setHours(prev => Math.max(prev - 1, 0));
        } else if (action === "increment") {
            setHours(prev => Math.min(prev + 1, 23));
        }
    };
    const handleMinutesIncDec = (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === "decrement") {
            setMinutes(prev => Math.max(prev - 1, 0));
        } else if (action === "increment") {
            setMinutes(prev => Math.min(prev + 1, 59));
        }
    };
    const handleInputHoursChange = e => {
        const val = parseInt(e.target.value);
        if (!numsCheckArr.includes(val)) setHours(0);
        else if (val > 23) setHours(23);
        else if (val < 0) setHours(0);
        else setHours(val);
    };
    const handleInputMinutesChange = e => {
        const val = parseInt(e.target.value);
        if (!minutesArr.includes(val)) setMinutes(0);
        else if (val > 59) setMinutes(59);
        else if (val < 0) setMinutes(0);
        else setMinutes(val);
    };

    // Reset countdown when bonus time is no longer active
    useEffect(() => {
        if (bonusTimeActive === false) {
            setBonusDeadline(null);
        }
    }, [bonusTimeActive]);

    // Fetch remaining time from the server (restart-safe)
    useEffect(() => {
        let isMounted = true;
        if (trafficRuleId) {
            (async function() {
                try {
                    const res = await fetch("/getbonusrulesmap", {
                        method: "POST",
                        mode: "cors",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ trafficRuleId })
                    });
                    if (res.status === 200) {
                        const data = await res.json();
                        if (isMounted) setBonusDeadline(data.timer ? Date.now() + data.timer : null);
                    }
                } catch (error) {
                    console.error(error);
                }
            })();
        }
        return () => { isMounted = false; };
    }, [trafficRuleId]);

    // Countdown comes from the page's shared clock; expiry clears the deadline
    // and asks the parent to refresh, as the old per-component interval did.
    const { remaining: milliTime } = useCountdown(bonusDeadline, () => {
        setBonusDeadline(null);
        onStateChange?.();
    });

    const handleAddTime = async () => {
        try {
            setSubmitBtnLoading(true);
            const isAdditionalTime = milliTime ? true : false;
            const data = { hours, minutes, trafficRuleId, isAdditionalTime };
            const addBonusTime = await fetch("/addbonusrule", {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
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
                    onStateChange?.();
                }, 400);
            }
        } catch (error) {
            console.error(error);
        } finally {
            timer(500).then(() => setSubmitBtnLoading(false));
        }
    };

    const handleStopBonusTime = async () => {
        try {
            const res = await fetch("/deletebonusrule", {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trafficRuleId, cancelTimer: true })
            });
            if (res.ok) {
                setBonusDeadline(null);
                onStateChange?.();
            }
        } catch (error) {
            console.error(error);
        }
    };

    const formatTime = (ms) => {
        const h = Math.floor((ms / (1000*60*60)) % 24);
        const m = Math.floor((ms / (1000*60)) % 60);
        const s = Math.floor(ms / 1000 % 60);
        return `${h} : ${m} : ${s}`;
    };

    return (
        <>
            <button
                type="button"
                className={`btn btn-xs gap-0 ${milliTime ? "btn-info" : "btn-outline btn-info"}`}
                onClick={() => bonusDialogRef.current.showModal()}
                title={milliTime ? "Add more bonus time or stop" : "Give this rule bonus time"}
            >
                <MdMoreTime className="w-3.5 h-3.5" />
            </button>

            <dialog ref={bonusDialogRef} className="modal">
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Add Bonus Time</h3>

                    <div className="flex flex-col items-center justify-center gap-4 m-8">
                        <form className="max-w-xs mx-auto" onSubmit={(e) => e.preventDefault()}>
                            <div className="relative flex items-center max-w-[11rem]">
                                <button type="button" data-action="decrement" onClick={handleHoursIncDec} aria-label="Decrease hours" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-s-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content z-0 pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 2">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 1h16"/>
                                    </svg>
                                </button>
                                <input type="text" id={hoursInputId} inputMode="numeric" aria-label="Bonus time hours" onChange={handleInputHoursChange} className="bg-base-100 border-base-300 text-base-content" placeholder="" value={hours} required />
                                <label htmlFor={hoursInputId} className="absolute bottom-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center text-xs text-base-content/50 space-x-1 rtl:space-x-reverse">Hours</label>
                                <button type="button" data-action="increment" onClick={handleHoursIncDec} aria-label="Increase hours" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-e-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content pointer-events-none z-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 18">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 1v16M1 9h16"/>
                                    </svg>
                                </button>
                            </div>
                        </form>
                        <form className="max-w-xs mx-auto" onSubmit={(e) => e.preventDefault()}>
                            <div className="relative flex items-center max-w-[11rem]">
                                <button type="button" data-action="decrement" onClick={handleMinutesIncDec} aria-label="Decrease minutes" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-s-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
                                    <svg className="w-3 h-3 text-base-content z-0 pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 2">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 1h16"/>
                                    </svg>
                                </button>
                                <input type="text" id={minutesInputId} inputMode="numeric" aria-label="Bonus time minutes" onChange={handleInputMinutesChange} className="bg-base-100 border-base-300 text-base-content" placeholder="" value={minutes} required />
                                <label htmlFor={minutesInputId} className="absolute bottom-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center text-xs text-base-content/50 space-x-1 rtl:space-x-reverse">Minutes</label>
                                <button type="button" data-action="increment" onClick={handleMinutesIncDec} aria-label="Increase minutes" className="bg-base-200 hover:bg-base-300 border-base-300 rounded-e-lg p-3 h-11 focus:ring-base-300 focus:ring-2 focus:outline-none z-50">
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
                            >
                                Stop Current Timer
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
