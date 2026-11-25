import { useEffect, useRef, useState } from "react";
import TimeClock from './TimeClock/TimeClock';
import { dateIsInPast } from "./utility_functions/date_in_past_checker";
import { convertSelectedDateForComparison } from "./utility_functions/convertSelectedDate";
import LoadingDialog from "./utility_components/LoadingDialog";
import SubmitButtonComponent from "./utility_components/SubmitButtonComponent";
import { NETWORK_ERROR_MESSAGE, responseErrorMessage } from "./utility_functions/response_error_message";


export default function EasySched({ triggerRender, deviceId, deviceName }) {
    const [schedule, setSchedule] = useState({
        blockAllow: 'allow',
        id: deviceId ? parseInt(deviceId) : null,
        daysOfTheWeek: {
            sun: undefined,
            mon: undefined,
            tue: undefined,
            wed: undefined,
            thu: undefined,
            fri: undefined,
            sat: undefined,
        },
        toggleschedule: null
    });
    const submitButtonRef = useRef();
    const inputRef = useRef();
    const [checked, setChecked] = useState(true);
    const [deviceInfo, setDeviceInfo] = useState({ name: deviceName });
    const [changed, setChanged] = useState(false);
    const [invalidscheduleMessage, setInvalidscheduleMessage] = useState({});
    const oneTimeScheduleRef = useRef(null);
    const recurringScheduleRef = useRef(null);
    const [oneTimeSchedule, setOneTimeSchedule] = useState(false);
    const [timeData, setTimeData] = useState(null);
    const [localDeviceId, setLocalDeviceId] = useState(deviceId ? parseInt(deviceId) : null);
    const [dayOfTheWeekSelected, setDayOfTheWeekSelected] = useState(false);
    const [selectAllow, setSelectAllow] = useState(true);
    const badDateModalRef = useRef();
    const toggleLoadingDialogRef = useRef();
    const [submitButtonLoading, setSubmitButtonLoading] = useState(false);

    // Update state when deviceId prop changes
    useEffect(() => {
        if (deviceId) {
            setLocalDeviceId(parseInt(deviceId));
            setSchedule(prev => ({
                ...prev,
                id: parseInt(deviceId)
            }));
        }
    }, [deviceId]);

    const d1 = useRef();
    const d2 = useRef();
    const d3 = useRef();
    const d4 = useRef();
    const d5 = useRef();
    const d6 = useRef();
    const d7 = useRef();

    const resetToInitialState = () => {
        console.log('Reset Called!');
        setSchedule((prev) => ({
            ...prev,
            daysOfTheWeek: {
                sun: undefined,
                mon: undefined,
                tue: undefined,
                wed: undefined,
                thu: undefined,
                fri: undefined,
                sat: undefined,
            },
        }));
        setChanged(false);
        setInvalidscheduleMessage({});
        if (localDeviceId) {
            setSchedule(prev => ({
                ...prev,
                id: localDeviceId
            }));
        }
        setDayOfTheWeekSelected(false);
        if (!oneTimeSchedule) {
            if (d1.current) d1.current.checked = false;
            if (d2.current) d2.current.checked = false;
            if (d3.current) d3.current.checked = false;
            if (d4.current) d4.current.checked = false;
            if (d5.current) d5.current.checked = false;
            if (d6.current) d6.current.checked = false;
            if (d7.current) d7.current.checked = false;
        }
    };

    const handleTimeData = (data) => {
        setTimeData(data);
    };

    const checkDaysOfWeekNotChosen = () => {
        const chosenDaysOfWeek = Object.values(schedule.daysOfTheWeek);

        let mapChosen = chosenDaysOfWeek.map((i) => {
            if (typeof i === "number") {
                return true;
            } else {
                return false;
            }
        });
        let chosen = mapChosen.includes(true);
        return chosen;
    }

    useEffect(() => {
        setDayOfTheWeekSelected(checkDaysOfWeekNotChosen());
    }, [schedule.daysOfTheWeek, oneTimeSchedule]);

    const reFetch = () => { setChanged(prev => !prev); }

    const handleAllow = e => {
        setSchedule({
            ...schedule,
            blockAllow: e.target.value
        });
        setSelectAllow(true);
    }

    const handleBlock = e => {
        setSchedule({
            ...schedule,
            blockAllow: e.target.value
        });
        setSelectAllow(false);
    }

    const handleScheduleDayOfWeek = e => {
        const isChecked = e.target.checked;
        const updatedDaysOfTheWeek = {
            ...schedule.daysOfTheWeek,
            [e.target.name]: isChecked ? parseInt(e.target.value) : undefined
        }
        setSchedule((prevSchedule) => ({
            ...prevSchedule,
            daysOfTheWeek: updatedDaysOfTheWeek,
            id: localDeviceId
        }));
    }

    const handleScheduleTimes = e => {
        setSchedule({
            ...schedule,
            [e.target.name]: parseInt(e.target.value)
        })
    }

    const handleSubmit = async () => {
        setInvalidscheduleMessage({});
        if (!localDeviceId) {
            setInvalidscheduleMessage({ error: true, message: "Device ID is missing!" });
            return;
        }

        const selectedDateTime = convertSelectedDateForComparison(timeData);
        const isPastDate = dateIsInPast(selectedDateTime);

        console.log('timeData\t', timeData);
        console.log('selectedDateTime\t', selectedDateTime);
        console.log('new Date()\t', new Date());

        if (isPastDate && oneTimeSchedule) {
            setInvalidscheduleMessage({ error: true, message: "Cannot schedule a specific date that is in the past!" });
            badDateModalRef.current.showModal();
            return;
        }
        
        let daysOfTheWeekNumerals;
        if (!oneTimeSchedule) {
            daysOfTheWeekNumerals = [...Object.values(schedule.daysOfTheWeek).filter(i => i !== undefined)];
            console.log('daysOfTheWeekNumerals\t', daysOfTheWeekNumerals);
            
            if (!daysOfTheWeekNumerals || daysOfTheWeekNumerals.length === 0) {
                setInvalidscheduleMessage({ error: true, message: "Please select at least one day of the week!" });
                return;
            }
        }
        
        let modifiedDaysOfTheWeek = daysOfTheWeekNumerals;
        const oneTime = oneTimeSchedule;

        try {
            setSubmitButtonLoading(true);
            const submitData = await fetch('/addeasyschedule', {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ ...timeData, modifiedDaysOfTheWeek, ...schedule, deviceId: localDeviceId })
            });
            
            if (submitData.ok) {
                setInvalidscheduleMessage({ error: false });

                console.log('submitData \t', submitData);

                triggerRender();
                resetToInitialState();
            } else {
                const fallback = submitData.status === 422
                    ? 'The server could not accept this schedule. Check the date/time and selected days, then try again.'
                    : `Could not create the schedule (server said ${submitData.status}). Try again.`;
                const message = await responseErrorMessage(submitData, fallback);
                setInvalidscheduleMessage({ error: true, message });
            }
        } catch (error) {
            console.error(error);
            setInvalidscheduleMessage({ error: true, message: NETWORK_ERROR_MESSAGE });
        } finally {
            setSubmitButtonLoading(false);
        }
    }

    const handlePickedSchedule = e => {
        if (e.target.dataset.onetime === 'onetime') {
            setOneTimeSchedule(true);
            if (oneTimeScheduleRef.current) oneTimeScheduleRef.current.checked = true;
            if (recurringScheduleRef.current) recurringScheduleRef.current.checked = false;
            setSchedule((prev) => ({
                ...prev,
                daysOfTheWeek: {
                    sun: undefined,
                    mon: undefined,
                    tue: undefined,
                    wed: undefined,
                    thu: undefined,
                    fri: undefined,
                    sat: undefined,
                },
            }));
        } else if (e.target.dataset.recur === 'recur') {
            setOneTimeSchedule(false);
            if (oneTimeScheduleRef.current) oneTimeScheduleRef.current.checked = false;
            if (recurringScheduleRef.current) recurringScheduleRef.current.checked = true;
        }
        console.log(oneTimeSchedule);
        console.log('schedule \t', schedule);
    }

    return (
        <>
            <div className="flex items-center justify-center">
                <div className="join m-4 bg-base-200 border-8 border-base-200 rounded-lg">
                    <input
                        type="radio"
                        data-recur="recur"
                        ref={recurringScheduleRef}
                        onClick={handlePickedSchedule}
                        onChange={handlePickedSchedule}
                        name="radio-2"
                        className="btn join-item"
                        checked={!oneTimeSchedule}
                        aria-label="Recurring"
                    />
                    <input
                        type="radio"
                        data-onetime="onetime"
                        ref={oneTimeScheduleRef}
                        onClick={handlePickedSchedule}
                        onChange={handlePickedSchedule}
                        name="radio-2"
                        className="btn join-item"
                        checked={oneTimeSchedule}
                        aria-label="One Time"
                    />
                </div>
            </div>
            
            <div className="divider">Action</div>
            
            <div className="flex items-center justify-center">
                <div className="join m-4 bg-base-200 border-8 border-base-200 rounded-lg">
                    <input
                        onClick={handleAllow}
                        onChange={handleAllow}
                        className={`btn join-item`}
                        value="allow"
                        type="radio"
                        aria-label="Allow"
                        name="options"
                        checked={selectAllow}
                    />
                    <input
                        onClick={handleBlock}
                        onChange={handleBlock}
                        className={`btn join-item`}
                        value="block"
                        type="radio"
                        aria-label="Block"
                        name="options"
                        checked={!selectAllow}
                    />
                </div>
            </div>
            
            <div className={`flex items-center justify-center flex-col`}>
                <div className="flex flex-col">
                    {oneTimeSchedule
                        ? <div className="divider">Date & Time</div>
                        : <><div className="divider">Time</div></>}
                    
                    <div className="flex flex-row gap-2 mt-2 items-center justify-center text-primary mx-auto">
                        <TimeClock oneTime={oneTimeSchedule} handleTimeData={handleTimeData} />
                    </div>
                    
                    {oneTimeSchedule
                        ? <div></div>
                        : <>
                            <div className="divider">Repeat</div>
                            <div className="flex justify-center items-center gap-4">
                                <div className="flex flex-row my-4">
                                    <div className="join">
                                        <input 
                                            ref={d1} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="sun" 
                                            value="0" 
                                            type="checkbox" 
                                            className="btn join-item rounded-l-full" 
                                            aria-label="Sun"
                                        />
                                        <input 
                                            ref={d2} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="mon" 
                                            value="1" 
                                            type="checkbox" 
                                            className={`btn join-item`} 
                                            aria-label="M"
                                        />
                                        <input 
                                            ref={d3} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="tue" 
                                            value="2" 
                                            type="checkbox" 
                                            className="btn join-item" 
                                            aria-label="T"
                                        />
                                        <input 
                                            ref={d4} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="wed" 
                                            value="3" 
                                            type="checkbox" 
                                            className="btn join-item" 
                                            aria-label="W"
                                        />
                                        <input 
                                            ref={d5} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="thu" 
                                            value="4" 
                                            type="checkbox" 
                                            className="btn join-item" 
                                            aria-label="Th"
                                        />
                                        <input 
                                            ref={d6} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="fri" 
                                            value="5" 
                                            type="checkbox" 
                                            className="btn join-item" 
                                            aria-label="F"
                                        />
                                        <input 
                                            ref={d7} 
                                            onChange={handleScheduleDayOfWeek} 
                                            name="sat" 
                                            value="6" 
                                            type="checkbox" 
                                            className="btn join-item rounded-r-full" 
                                            aria-label="Sat"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>}
                    
                    <div className="divider"></div>
                    
                    <SubmitButtonComponent
                        handleSubmit={handleSubmit}
                        submitButtonLoading={submitButtonLoading}
                        enabledCriteria={oneTimeSchedule ? oneTimeSchedule : dayOfTheWeekSelected ? dayOfTheWeekSelected : false}
                    />

                    {invalidscheduleMessage.error && invalidscheduleMessage.message && (
                        <div role="alert" className="alert alert-error mt-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{invalidscheduleMessage.message}</span>
                        </div>
                    )}
                </div>
            </div>
            
            <dialog ref={badDateModalRef} className="modal">
                <div className="modal-box">
                    <h3 className="font-bold text-lg text-error">Error!</h3>
                    <p className="py-4 italic text-xl">{invalidscheduleMessage.message}</p>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn">Close</button>
                        </form>
                    </div>
                </div>
            </dialog>
            
            <LoadingDialog toggleLoadingDialogRef={toggleLoadingDialogRef} />
        </>
    )
}