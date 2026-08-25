import { useEffect, useRef, useState } from "react";
import PropTypes from 'prop-types';
import {
    HiShieldCheck,
    HiPencil,
    HiXMark,
    HiCheck,
    HiDevicePhoneMobile,
    HiCpuChip,
} from "react-icons/hi2";

// Edit an existing traffic rule in place. The user can change the rule
// description, its action (BLOCK/ALLOW) and the set of target devices.
// The change is pushed to the UniFi controller and mirrored in the local DB
// via PUT /updatetrafficrule.
export default function EditRuleModal({ dialogRef, rule, rawRule, categoryName, onSuccess }) {
    const ruleMeta = rule?.trafficRule || {};
    const [description, setDescription] = useState(ruleMeta.description || "");
    const [blockAllow, setBlockAllow] = useState(ruleMeta.blockAllow || "BLOCK");
    const [devices, setDevices] = useState([]);
    const [deviceSelection, setDeviceSelection] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unifiSubmissionError, setUnifiSubmissionError] = useState({});
    const [submissionError, setSubmissionError] = useState({});
    const [pageLoading, setPageLoading] = useState(true);

    const descriptionRef = useRef();
    const unifiErrorDialogRef = useRef();
    const errorDialogRef = useRef();

    const handleClose = () => {
        if (dialogRef.current) dialogRef.current.close();
    };

    useEffect(() => {
        const getDevices = async () => {
            try {
                const res = await fetch("/getcurrentdevices");
                if (res.ok) {
                    const data = await res.json();
                    const list = data.getDeviceList || [];
                    setDevices(list);
                    const existingMacs = new Set(
                        (rule?.matchingTargetDevices || [])
                            .map((d) => (d.client_mac || "").toLowerCase())
                    );
                    const preSelected = list.filter((d) =>
                        existingMacs.has((d.macAddress || "").toLowerCase())
                    );
                    setDeviceSelection(preSelected);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setPageLoading(false);
            }
        };
        getDevices();
    }, [rule]);

    const handleSelectDevice = (e) => {
        if (e.target.checked) {
            const matched = devices.filter(
                (d) => d.id === parseInt(e.target.dataset.deviceid)
            );
            setDeviceSelection((prev) => [...new Set([...prev, ...matched])]);
        } else {
            setDeviceSelection((prev) =>
                prev.filter(
                    (d) => d.id !== parseInt(e.target.dataset.deviceid)
                )
            );
        }
    };

    const canSubmit = description !== "" && blockAllow !== "" && !loading;

    const handleSave = async () => {
        if (!rawRule) {
            setSubmissionError({ name: "NoRule", message: "Could not find the UniFi rule to edit." });
            errorDialogRef.current.showModal();
            return;
        }

        const unifiRule = JSON.parse(JSON.stringify(rawRule));
        unifiRule.description = description;
        unifiRule.action = blockAllow;
        unifiRule.target_devices = deviceSelection.map((d) => ({
            client_mac: d.macAddress,
            type: "CLIENT",
        }));

        setLoading(true);
        try {
            const res = await fetch("/updatetrafficrule", {
                method: "PUT",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    trafficRuleId: ruleMeta.id,
                    unifiRule,
                    description,
                    action: blockAllow,
                    targetDevices: unifiRule.target_devices,
                    dbDevices: deviceSelection.map((d) => ({
                        id: d.id,
                        name: d.name,
                        macAddress: d.macAddress,
                    })),
                }),
            });
            const result = await res.json();
            if (result.success) {
                setLoading(false);
                handleClose();
                onSuccess();
            } else if (result.error) {
                setLoading(false);
                setUnifiSubmissionError({
                    code: result.error?.id,
                    message: result.error?.message,
                });
                unifiErrorDialogRef.current.showModal();
            } else {
                setLoading(false);
            }
        } catch (error) {
            setLoading(false);
            setSubmissionError({ name: error?.name, message: error?.message });
            errorDialogRef.current.showModal();
        }
    };

    const appNames = (rule?.matchingAppIds || []).map(
        (a) => a?.app_name
    );

    return (
        <>
            <dialog ref={dialogRef} className="modal">
                <div className="modal-box max-w-3xl w-full h-[85vh] flex flex-col p-0 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center px-6 pt-5 pb-4 border-b border-base-300 flex-shrink-0">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <HiPencil className="w-5 h-5 text-primary flex-shrink-0" />
                            <h2 className="font-bold text-lg truncate">Edit Rule</h2>
                        </div>
                        <div className="flex-1 flex justify-end min-w-0">
                            <button
                                className="btn btn-ghost btn-sm btn-circle"
                                onClick={handleClose}
                                aria-label="Close"
                            >
                                <HiXMark className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                        {pageLoading && (
                            <div className="flex items-center justify-center py-10 text-base-content/50">
                                <span className="loading loading-spinner" />
                            </div>
                        )}

                        {!pageLoading && (
                            <>
                                {/* Read-only scope summary */}
                                <div className="rounded-xl border border-base-300 bg-base-200 p-4 flex flex-col gap-2">
                                    <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                                        Rule Scope
                                    </p>
                                    {appNames.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {appNames.map((name) => (
                                                <span
                                                    key={name}
                                                    className="badge badge-primary badge-sm"
                                                >
                                                    <HiCpuChip className="w-3.5 h-3.5" />
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-sm font-semibold text-primary">
                                            {categoryName
                                                || "Category rule"}
                                        </span>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="flex flex-col gap-2">
                                    <label
                                        htmlFor="edit-description"
                                        className="text-sm font-semibold"
                                    >
                                        Description
                                    </label>
                                    <input
                                        id="edit-description"
                                        className="input input-bordered w-full"
                                        placeholder="e.g. Block YouTube on Xbox"
                                        ref={descriptionRef}
                                        value={description}
                                        onChange={(e) =>
                                            setDescription(e.target.value)
                                        }
                                    />
                                </div>

                                {/* Block / Allow */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold">
                                        Action
                                    </label>
                                    <div className="flex items-center gap-1 bg-base-200 rounded-xl p-1 shadow-inner w-fit">
                                        <button
                                            type="button"
                                            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                                blockAllow === "ALLOW"
                                                    ? "bg-success text-success-content shadow-sm"
                                                    : "text-base-content/60 hover:text-base-content hover:bg-base-300"
                                            }`}
                                            onClick={() =>
                                                setBlockAllow("ALLOW")
                                            }
                                        >
                                            <HiCheck className="w-4 h-4" />
                                            Allow
                                        </button>
                                        <button
                                            type="button"
                                            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                                blockAllow === "BLOCK"
                                                    ? "bg-error text-error-content shadow-sm"
                                                    : "text-base-content/60 hover:text-base-content hover:bg-base-300"
                                            }`}
                                            onClick={() =>
                                                setBlockAllow("BLOCK")
                                            }
                                        >
                                            <HiXMark className="w-4 h-4" />
                                            Block
                                        </button>
                                    </div>
                                </div>

                                {/* Devices */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold">
                                        Target Devices
                                    </label>
                                    {devices.length > 0 ? (
                                        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                                            {devices.map((device) => {
                                                const isSelected = deviceSelection.some(
                                                    (d) => d.id === device.id
                                                );
                                                return (
                                                    <label
                                                        key={device.id}
                                                        className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                                                            isSelected
                                                                ? "border-accent bg-accent/10"
                                                                : "border-base-300 bg-base-200 hover:border-accent/50"
                                                        }`}
                                                    >
                                                        <span className="text-sm font-medium flex items-center gap-2">
                                                            <HiDevicePhoneMobile className="w-4 h-4 text-base-content/40" />
                                                            {device.name}
                                                        </span>
                                                        <input
                                                            type="checkbox"
                                                            className={`toggle toggle-sm ${isSelected
                                                                ? "toggle-accent"
                                                                : ""}`}
                                                            data-deviceid={device.id}
                                                            onChange={
                                                                handleSelectDevice
                                                            }
                                                            checked={isSelected}
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-base-content/40 italic p-3 border border-base-300 rounded-lg">
                                            No devices found. Add devices in the
                                            Devices tab first.
                                        </p>
                                    )}
                                    <span className="badge badge-accent badge-sm gap-1">
                                        {deviceSelection.length} device
                                        {deviceSelection.length !== 1
                                            ? "s"
                                            : ""}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-base-300 flex-shrink-0">
                        <button
                            className="btn btn-ghost"
                            onClick={handleClose}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary gap-1"
                            disabled={!canSubmit}
                            onClick={handleSave}
                        >
                            {loading ? (
                                <span
                                    className="loading loading-spinner loading-sm"
                                />
                            ) : (
                                <>
                                    <HiShieldCheck className="w-4 h-4" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <form method="dialog" className="modal-backdrop">
                    <button onClick={handleClose}>close</button>
                </form>
            </dialog>

            {/* UniFi error dialog */}
            <dialog ref={unifiErrorDialogRef} className="modal">
                <div className="modal-box">
                    <div className="flex items-center gap-2 mb-4">
                        <HiXMark className="w-6 h-6 text-error" />
                        <h3 className="font-bold text-lg">UniFi Error</h3>
                    </div>
                    <div className="flex flex-col gap-2 text-sm bg-base-200 rounded-lg p-4">
                        <p className="flex justify-between">
                            <span className="text-base-content/60">
                                Details:
                            </span>
                            <span className="text-error font-medium">
                                {unifiSubmissionError.code ?? "none"}
                            </span>
                        </p>
                        <p className="flex justify-between">
                            <span className="text-base-content/60">Message:</span>
                            <span className="text-error font-medium">
                                {unifiSubmissionError.message ?? "none"}
                            </span>
                        </p>
                    </div>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn btn-ghost">Close</button>
                        </form>
                    </div>
                </div>
            </dialog>

            {/* Frontend error dialog */}
            <dialog ref={errorDialogRef} className="modal">
                <div className="modal-box">
                    <div className="flex items-center gap-2 mb-4">
                        <HiXMark className="w-6 h-6 text-error" />
                        <h3 className="font-bold text-lg">Submission Error</h3>
                    </div>
                    <div className="flex flex-col gap-2 text-sm bg-base-200 rounded-lg p-4">
                        <p className="flex justify-between">
                            <span className="text-base-content/60">
                                Error Name:
                            </span>
                            <span className="text-error font-medium">
                                {submissionError.name ?? "none"}
                            </span>
                        </p>
                        <p className="flex justify-between">
                            <span className="text-base-content/60">
                                Error Message:
                            </span>
                            <span className="text-error font-medium">
                                {submissionError.message ?? "none"}
                            </span>
                        </p>
                    </div>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn btn-ghost">Close</button>
                        </form>
                    </div>
                </div>
            </dialog>
        </>
    );
}

EditRuleModal.propTypes = {
    dialogRef: PropTypes.object.isRequired,
    rule: PropTypes.shape({
        trafficRule: PropTypes.object,
        matchingTargetDevices: PropTypes.array,
        matchingAppIds: PropTypes.array,
    }),
    rawRule: PropTypes.object,
    categoryName: PropTypes.string,
    onSuccess: PropTypes.func,
};
