import { useEffect, useRef, useState } from "react";
import { importToDbConverter } from "../utility_functions/app_cat_utils";
import { useGetAllDevices } from "./useGetAllDevices";
import { debugLog } from "../../utility_functions/debugMode";

// Shared traffic-rule logic (fetch, toggle, delete, unmanage, edit, import).
// Used by both the standalone TrafficRules screen and the unified PolicyList
// so there's a single source of truth for rule actions.
export function useTrafficRules() {
    // The full controller client list is only needed for "Import UniFi Rules",
    // so fetch it lazily the first time the import modal is opened instead of on
    // page load (keeps the large list out of memory until it's actually used).
    const [importModalOpened, setImportModalOpened] = useState(false);
    const { existingDeviceList, allClientDeviceList } = useGetAllDevices(importModalOpened);
    const [customAPIRules, setCustomAPIRules] = useState([]);
    const [unifiRuleObject, setUnifiRuleObject] = useState([]);
    const [importRuleChoices, setImportRuleChoices] = useState([]);
    const [importRuleSelection, setImportRuleSelection] = useState([]);
    const [checked, setChecked] = useState(false);
    const [render, setRender] = useState(false);
    const [importOption, setImportOption] = useState(false);
    const [loadingImportSubmission, setLoadingImportSubmission] = useState(false);
    const [loadingUnmanageApp] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const importDialogRef = useRef();
    const createRuleDialogRef = useRef();
    const editRuleDialogRef = useRef();
    const speedLimitDialogRef = useRef();
    const [editingRule, setEditingRule] = useState(null);
    const [editingRawRule, setEditingRawRule] = useState(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");

    function checkForImportRules(dbData, unifiData) {
        // Exclude plain site-wide INTERNET rules, but keep per-client speed-limit
        // rules (which have bandwidth_limit.enabled and use INTERNET as their
        // destination) so they show up as importable.
        const filterOutInternetMatchingTarget = unifiData.filter((rule) =>
            rule.matching_target !== "INTERNET" || rule.bandwidth_limit?.enabled
        );
        if (dbData !== null) {
            const importData = filterOutInternetMatchingTarget.filter(unifiData =>
                dbData.some(dbIds => dbIds.trafficRule.unifiId !== unifiData._id));
            return importData;
        } else {
            return filterOutInternetMatchingTarget;
        }
    }
    function checkDeviceType(arr) {
        return arr.filter(device => {
            return !(device?.target_devices?.every(innerDevice => innerDevice?.type === "NETWORK"));
        });
    }
    const handleImportModalOpen = () => {
        setImportModalOpened(true);
        importDialogRef.current.showModal();
    }
    const openEditRule = (data, rawRule) => {
        const match = (unifiRuleObject || []).find((r) =>
            r._id === data?.trafficRule?.unifiId
        );
        setEditingRule(data);
        setEditingRawRule(match || null);
        setEditingCategoryName(match?.description || rawRule?.description || "");
        editRuleDialogRef.current.showModal();
    }
    const handleImportModalClose = () => {
        importDialogRef.current.close();
        const resetCheckedState = {};
        importRuleChoices.forEach(choice => {
            resetCheckedState[choice._id] = false;
        });
        setChecked(false);
        setImportRuleSelection([]);
    }
    const handleSelectedImport = (e, id) => {
        setChecked(prevState => ({
            ...prevState,
            [id]: !prevState[id]
        }));
        const choicesFilter = importRuleChoices.filter((choice) => choice._id === id);
        if (e.target.checked) {
            const noDuplicates = [...new Set(choicesFilter)];
            setImportRuleSelection(prev => ([
                ...prev,
                ...noDuplicates
            ]))
        } else if (!e.target.checked) {
            const filteredOut = importRuleSelection.filter(id => id._id !== e.target.dataset.id);
            const noDuplicates = [...new Set(filteredOut)];
            setImportRuleSelection([...noDuplicates])
        }
        debugLog('importRuleSelection \t', importRuleSelection);
    }
    const handleUnmanageApp = e => {
        debugLog(e.currentTarget.dataset.trafficruleid);
        const dbId = e.currentTarget.dataset.trafficruleid;
        const unmanageApp = async () => {
            try {
                const submitUnmanageApp = await fetch('/unmanageapp', {
                    method: 'DELETE',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ dbId })
                });
                if (submitUnmanageApp.ok) {
                    debugLog(`DB ID: ${dbId} unmanaged successfully!`);
                    reRender();
                }
            } catch (error) {
                console.error(error);
            }
        }
        unmanageApp();
    }
    const reRender = () => {
        debugLog('Component re-rendered.');
        setRender(prev => !prev);
        setEditingRule(null);
        setEditingRawRule(null);
        setEditingCategoryName("");
    }
    const handleToggle = async e => {
        const checked = e.currentTarget.checked;
        const _id = e.currentTarget.dataset.unifiruleid;
        const findUnifiObj = unifiRuleObject.filter(rule => rule._id === _id).pop();
        const unifiObjCopy = JSON.parse(JSON.stringify(findUnifiObj));
        unifiObjCopy.enabled = checked;

        const trafficRuleId = e.currentTarget.dataset.dbtrafficruleid;
        try {
            const toggleEnabled = await fetch('/updatetrafficruletoggle', {
                method: 'PUT',
                mode: 'cors',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ _id, trafficRuleId, unifiObjCopy })
            });
            if (toggleEnabled.ok) {
                reRender();
            }
        } catch (error) {
            console.error('There was an error toggling the Traffic Rule.');
        }
    }
    const handleDeleteTrafficRule = async e => {
        const _id = e.currentTarget.dataset.trafficid;
        const trafficRuleId = e.currentTarget.dataset.trafficruleid;
        try {
            const deleteTrafficRule = await fetch('/deletecustomapi', {
                method: 'DELETE',
                mode: 'cors',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ _id, trafficRuleId })
            });
            if (deleteTrafficRule.ok) {
                debugLog('Delete Successful.');
                const res = await deleteTrafficRule.json();
                debugLog(res.result);
                reRender();
            }
        } catch (error) {
            console.error(error);
        }
    }
    const handleImportOption = async () => {
        setLoadingImportSubmission(true);

        const importExists = checkForImportRules(customAPIRules, unifiRuleObject);
        if (importExists.length) {
            debugLog('importExists \t', importExists);
        }
        const { categoryClones, appClones } = importToDbConverter(importRuleSelection, allClientDeviceList, existingDeviceList);
        if (categoryClones || appClones) {
            debugLog('categoryClones \t', categoryClones);
            debugLog('appClones \t', appClones);
        }
        try {
            const importExistingRules = await fetch('/importexistingunifirules', {
                method: 'POST',
                mode: 'cors',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ categoryClones, appClones })
            });

            if (importExistingRules.ok) {
                setLoadingImportSubmission(false);
                handleImportModalClose();
                setChecked(false);
                reRender();
            }
        } catch (error) {
            setLoadingImportSubmission(false);
            console.error(error);
        }
    }

    useEffect(() => { // refresh after re-render && initial?
        const fetchCustomAPIRules = async () => {
            const getCustomRules = await fetch('/getdbcustomapirules');
            try {
                if (getCustomRules.status === 206) {
                    setCustomAPIRules([]);
                    const { unifiData } = await getCustomRules.json();

                    setUnifiRuleObject(unifiData);
                    const filteredOutNetworkDevices = checkDeviceType(unifiData);
                    const importExists = checkForImportRules(null, filteredOutNetworkDevices);

                    if (importExists.length) {
                        setImportOption(true);
                        setImportRuleChoices([...importExists]);
                    }
                } else if (getCustomRules.status === 200) {
                    const { trafficRuleDbData, unifiData } = await getCustomRules.json();
                    if (trafficRuleDbData.length) {
                        setCustomAPIRules(trafficRuleDbData);
                    }
                    setUnifiRuleObject(unifiData);
                    const filteredOutNetworkDevices = checkDeviceType(unifiData);
                    const importExists = checkForImportRules(trafficRuleDbData, filteredOutNetworkDevices);
                    const filterOutRulesAlreadyInList = importExists.filter(rule => !trafficRuleDbData.some(obj => obj.trafficRule.unifiId === rule._id));
                    if (filterOutRulesAlreadyInList.length) {
                        setImportOption(true);
                        setImportRuleChoices([...filterOutRulesAlreadyInList]);
                    }
                }
            } catch (error) {
                console.error(error);
            } finally {
                setPageLoading(false);
            }
        }
        fetchCustomAPIRules();
    }, [render]);

    return {
        customAPIRules,
        unifiRuleObject,
        pageLoading,
        loadingUnmanageApp,
        importOption,
        importRuleChoices,
        importRuleSelection,
        checked,
        editingRule,
        editingRawRule,
        editingCategoryName,
        importDialogRef,
        createRuleDialogRef,
        editRuleDialogRef,
        speedLimitDialogRef,
        handleImportModalOpen,
        openEditRule,
        handleImportModalClose,
        handleSelectedImport,
        handleUnmanageApp,
        reRender,
        handleToggle,
        handleDeleteTrafficRule,
        handleImportOption,
        loadingImportSubmission,
    };
}
