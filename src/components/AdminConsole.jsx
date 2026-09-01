import { useEffect, useRef, useState, useCallback } from 'react';
import PolicyList from "./PolicyList";
import { useOutletContext } from 'react-router-dom';
import NuaSvg from "../images/nua.svg";
import { HiOutlineChevronUp } from 'react-icons/hi2';
import { debugLog } from '../utility_functions/debugMode';


export default function AdminConsole()
{
    const [macData, setMacData] = useState([]);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [toggleReRender, setToggleReRender] = useState(false);
    const [loadingMacData, setLoadingMacData] = useState(false);
    const [syncHealth, setSyncHealth] = useState({
        stale: false,
        stateSource: 'unknown',
        lastSyncedAt: null,
    });
    const initialized = useRef(false);
    const { openSettings, syncBannerOpen, onToggleSyncBanner } = useOutletContext() ?? {};
    const dialogRef = useRef();
    const [showScrollTop, setShowScrollTop] = useState(false);
    const scrollSentinelRef = useRef();
    const macRequestCounterRef = useRef(0);
    const macRequestAbortRef = useRef(null);

    // Show/hide "scroll to top" button when user scrolls past the sentinel
    useEffect(() => {
        const sentinel = scrollSentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowScrollTop(!entry.isIntersecting);
            },
            { threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    const scrollToTop = useCallback(() => {
        document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleProceed = () => {
        openSettings?.();
    }

    const handleRenderToggle = () => { // re-trigger
        setToggleReRender(prev => !prev)
    }

    useEffect(() => { // /getmacaddresses initial fetch
        const requestId = ++macRequestCounterRef.current;
        if (macRequestAbortRef.current) {
            macRequestAbortRef.current.abort();
        }
        const controller = new AbortController();
        macRequestAbortRef.current = controller;

        setLoadingMacData(true);
        const handleGetMacAddresses = async () => {
            try {
                const response = await fetch('/getmacaddresses', {
                    method: 'GET',
                    mode: 'cors',
                    signal: controller.signal,
                });

                if (requestId !== macRequestCounterRef.current) {
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    debugLog('macData from ping re-render:\t', data);
                    setMacData([...data.macData] || []);
                    setBlockedUsers([...data.blockedUsers] || []);
                    setSyncHealth({
                        stale: Boolean(data?.stale),
                        stateSource: data?.stateSource || 'unknown',
                        lastSyncedAt: Date.now(),
                    });
                } else if (!response.ok) {
                    if (response.status === 401) {
                        dialogRef.current.showModal();
                    } else {
                        setSyncHealth((previous) => ({
                            ...previous,
                            stale: true,
                            stateSource: 'fetch-error',
                        }));
                    }
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return;
                }
                setSyncHealth((previous) => ({
                    ...previous,
                    stale: true,
                    stateSource: 'network-error',
                }));
                console.error('consoleerror in /getmacaddresses', error);
            } finally {
                if (requestId === macRequestCounterRef.current) {
                    setLoadingMacData(false);
                }
            }
        }
        handleGetMacAddresses();

        return () => {
            controller.abort();
        };
    }, [toggleReRender]);

    useEffect(() => { // live updates via SSE
        let eventSource;
        try {
            eventSource = new EventSource('/pingmacaddresses');
            eventSource.onmessage = (event) => {
                if (event) {
                    handleRenderToggle();
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
                        await cronData.json();
                        debugLog('Cron job re-initiation check complete');
                    }
                } catch (error) {
                    console.error('Error Fetching "/checkjobreinitiation" \t', error);
                }
            }
            getCronData();
        }
    }, []);

    return (
        <>
            <div className="w-full">
                {/* Sentinel — when this scrolls out of view, the scroll-to-top button appears */}
                <div ref={scrollSentinelRef} className="h-px" />

                {/* Unified content wrapper */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pb-8">
                    {/* Sync status — collapsed by default; expanded by the health bubble in the navbar */}
                    {syncBannerOpen && (
                        <div className={`rounded-xl border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3 ${
                            syncHealth.stale ? 'border-warning/40 bg-warning/10 text-warning-content' : 'border-success/30 bg-success/10 text-success-content'
                        }`}>
                            <div className="font-medium">
                                {syncHealth.stale
                                    ? 'Device state is using fallback data. Live UniFi sync is temporarily unavailable.'
                                    : 'Device state is synced with UniFi.'}
                            </div>
                            <div className="opacity-80">
                                <span className="font-semibold">Source:</span> {syncHealth.stateSource}
                                {syncHealth.lastSyncedAt ? ` • Updated ${new Date(syncHealth.lastSyncedAt).toLocaleTimeString()}` : ''}
                            </div>
                            <button
                                className="btn btn-ghost btn-xs"
                                onClick={onToggleSyncBanner}
                                title="Hide sync status"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    <div className="bg-base-100 rounded-2xl border border-base-300 shadow-sm overflow-hidden">
                        <PolicyList
                            macData={macData && macData}
                            blockedUsers={blockedUsers}
                            handleRenderToggle={handleRenderToggle}
                            loadingMacData={loadingMacData}
                        />
                    </div>
                </div>
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

            {/* Scroll-to-top button */}
            <button
                className={`fixed bottom-6 right-6 z-50 btn btn-circle btn-primary shadow-lg transition-all duration-300 ${
                    showScrollTop
                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                        : 'opacity-0 translate-y-4 pointer-events-none'
                }`}
                onClick={scrollToTop}
                aria-label="Scroll to top"
                title="Back to top"
            >
                <HiOutlineChevronUp className="w-5 h-5" />
            </button>
        </>
    )
}
