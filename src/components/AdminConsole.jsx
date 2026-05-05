import { useEffect, useRef, useState } from 'react';
import ModernDevices from "./ModernDevices";
import TrafficRules from "./traffic_rules/TrafficRules";
import { useNavigate, useOutletContext } from 'react-router-dom';
import NuaSvg from "../images/nua.svg";
import { HiOutlineDeviceTablet, HiOutlineShieldCheck } from 'react-icons/hi2';


export default function AdminConsole()
{
    const [inputData, setInputData] = useState({
        active: false,
    });
    const [macData, setMacData] = useState([]);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [validationError, setValidationError] = useState(false);
    const [toggleReRender, setToggleReRender] = useState(false);
    const [cronJobCheck, setCronJobChecked] = useState({});
    const [loadingMacData, setLoadingMacData] = useState(false);
    const [activeTab, setActiveTab] = useState('devices');
    const initialized = useRef(false);
    const navigate = useNavigate();
    const { openSettings } = useOutletContext() ?? {};
    const [countdown, setCountdown] = useState(2);
    const dialogRef = useRef();


    const timer = t => new Promise(res => setTimeout(res, t));
    const handleTimer = async () => {
        const timer = t => new Promise(res => setTimeout(res, t));
        try {
            await timer(1000)
            setCountdown(1)
            await timer(1000)
            setCountdown(0)
        } catch (e) {
            if (e) throw e;
        }
    }
    const handleProceed = () => {
        openSettings?.();
    }

    // function validateMacAddress(mac) {
    //     const macRegex = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;
    //     return macRegex.test(mac)
    // }
    // const handleScroll = () => {
    //     document.getElementById('top').scrollIntoView({ block: 'center', behavior: 'smooth' });
    // }
    const handleRenderToggle = () => { // re-trigger
        setToggleReRender(prev => !prev)
    }
    const handleInput = e => {
        setValidationError(false)
        setInputData({
            ...inputData,
            [e.target.name]: e.target.value,
        })
    }
    // const handleAddMacAddresses = async () => { // add mac addresses
    //     try {
    //         if (validateMacAddress(inputData.macAddress)) {
    //             setValidationError(false)
    //         } else {
    //             setValidationError(true)
    //             timer(3000).then(() => setValidationError(false))
    //             return
    //         }
    //         const submitData = await fetch('/addmacaddresses', {
    //             method: 'POST',
    //             mode: 'cors',
    //             headers: {
    //                 "Content-Type" : "application/json"
    //             },
    //             body: JSON.stringify(inputData)
    //         });
    //         if (submitData.ok) {
    //             const returnData = await submitData.json();
    //             // console.log(returnData);
    //             macRef.current.value = '';
    //             deviceNameRef.current.value = '';
    //             handleRenderToggle();
    //         }
    //     } catch (error) {
    //         console.error(error);
    //     }
    // }

    useEffect(() => { // /getmacaddresses initial fetch
        setLoadingMacData(true);
        const handleGetMacAddresses = async () => {
            try {
                const response = await fetch('/getmacaddresses', {
                    method: 'GET',
                    mode: 'cors',
                });
                if (response.ok) {
                    const data = await response.json();
                    console.log('macData from ping re-render:\t', data);
                    // setMacData(data ? data : {}); // previous, updating
                    setMacData([...data.macData] || []);
                    setBlockedUsers([...data.blockedUsers] || []);
                    setLoadingMacData(false)
                } else if (!response.ok) {
                    dialogRef.current.showModal();
                    setLoadingMacData(false);
                    // await handleTimer();
                }
            } catch (error) {
                dialogRef.current.showModal();
                setLoadingMacData(false);
                console.error('consoleerror in /getmacaddresses', error);
            }
        }
        handleGetMacAddresses();
    }, [toggleReRender]);

    // useEffect(() => { // original 03/04/2024
    //     const eventSource = new EventSource('/pingmacaddresses');
    //     eventSource.onmessage = (event) => {
    //         if (event) {
    //             handleRenderToggle();
    //         }
    //     }
    //     eventSource.onerror = (error) => {
    //         console.error(error);
    //     };
    //     return () => {
    //         eventSource.close();
    //     }
    // }, [])

    useEffect(() => { // new 03/04/2024 // revisited 11 15 2024 - need this to not interrupt state in devices component
        let eventSource;
        try {
            eventSource = new EventSource('/pingmacaddresses');
            eventSource.onmessage = (event) => {
                if (event) {
                    handleRenderToggle();
                    // console.log('%chandleRenderToggle() if(event)...', 'color: pink; background: black; font-size: 12px;');
                    // console.log('event \t', event);
                }
            }
            eventSource.onerror = (error) => {
                console.error(error);
            };
            return () => {
                eventSource.close();
            }
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => { // check if server crash & jobs need re-initiation
        if (!initialized.current) {
            initialized.current = true;
            const getCronData = async () => {
                try {
                    const cronData = await fetch('/checkjobreinitiation');
                    if (cronData.ok) {
                        const cronJobCheckData = await cronData.json();
                        setCronJobChecked(cronJobCheckData);
                        console.log('Cron Job Check Data: ', cronJobCheckData);
                    }
                } catch (error) {
                    // if (error) throw error; // prev 03/4/2024
                    console.error('Error Fetching "/checkjobreinitiation" \t', error);
                }
            }
            getCronData();
        }
        // if (serverRestart) {
        //     getCronData();
        //     setServerRestart(false);
        // }
    }, []);

    const addCustomRule = () => { // original block app test
        const fetchStuff = async () => {
           try {
            const response = await fetch('/fetchcustomapi', {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type' : 'application/json'
                },
                body: JSON.stringify({instagramObject})
            })
            if (response.ok) {
                console.log(response)
                let rj = await response.json();
                console.log('rj: \t', rj);
            }
           } catch (error) {
            console.error(error)
           }
        }
        fetchStuff();
    }


    return (
        <>
            <div className="w-full">
                {/* Tab bar */}
                <div className="flex justify-center pt-4 pb-6">
                    <div className="relative flex items-center gap-1 bg-base-200 rounded-xl p-1 shadow-inner">
                        <button
                            role="tab"
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                activeTab === 'devices'
                                    ? 'bg-primary text-primary-content shadow-md'
                                    : 'text-base-content/60 hover:text-base-content hover:bg-base-300'
                            }`}
                            onClick={() => setActiveTab('devices')}
                        >
                            <HiOutlineDeviceTablet className="w-4 h-4" />
                            Devices
                        </button>
                        <button
                            role="tab"
                            className={`relative flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                activeTab === 'traffic'
                                    ? 'bg-primary text-primary-content shadow-md'
                                    : 'text-base-content/60 hover:text-base-content hover:bg-base-300'
                            }`}
                            onClick={() => setActiveTab('traffic')}
                        >
                            <HiOutlineShieldCheck className="w-4 h-4" />
                            Traffic Rules
                        </button>
                    </div>
                </div>

                {activeTab === 'devices' ? (
                    <ModernDevices
                        macData={macData && macData}
                        blockedUsers={blockedUsers}
                        handleRenderToggle={handleRenderToggle}
                        loadingMacData={loadingMacData}
                    />
                ) : (
                    <TrafficRules />
                )}
            </div>

            {/* navigate to credentials modal */}
            <dialog id="redirectModal" className="modal" ref={dialogRef}>
                <div className="modal-box flex flex-col items-center justify-center overflow-x-hidden">
                    <h1 className="nuaFont text-2xl">NUA</h1>
                    <h2 className="font-bold text-xl">Welcome!</h2>
                    <h3 className="font-bold text-lg text-center">Your UniFi login credentials must be set to proceed...</h3>
                    <div className="btn btn-block mt-2 font-semi-bold italic text-green-500" onClick={handleProceed}>Proceed to Site Settings</div>
                    <div className="absolute top-3 right-5">
                        <img
                            src={NuaSvg}
                            alt="NUA Logo"
                            className="w-10 h-10"
                        />
                    </div>
                </div>
            </dialog>
        </>
    )
}