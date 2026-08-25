import { useEffect, useRef, useState } from "react";
import PropTypes from 'prop-types';
import {
    HiBolt,
    HiShieldCheck,
    HiXMark,
    HiDevicePhoneMobile,
} from "react-icons/hi2";

// Create a UniFi speed-limit traffic rule: pick target devices and set a
// download/upload cap. The rule is pushed to the UniFi controller and mirrored
// in the local DB via POST /addspeedlimittrafficrule.
export default function SpeedLimitModal({ dialogRef, onSuccess }) {
    const [description, setDescription] = useState("");
    const [downloadMbps, setDownloadMbps] = useState("");
    const [uploadMbps, setUploadMbps] = useState("");
    const [enabled, setEnabled] = useState(true);
    const [devices, setDevices] = useState([]);
    const [deviceSelection, setDeviceSelection] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unifiSubmissionError, setUnifiSubmissionError] = useState({});
    const [submissionError, setSubmissionError] = useState({});

    const descriptionRef = useRef();
    const downloadRef = useRef();
    const uploadRef = useRef();
    const unifiErrorDialogRef = useRef();
    const errorDialogRef = useRef();

    const handleClose = () => {
        if (dialogRef.current) dialogRef.current.close();
        // Reset on close so the form is blank next time it is opened.
        setDescription("");
        setDownloadMbps("");
        setUploadMbps("");
        setEnabled(true);
        setDeviceSelection([]);
    };

    useEffect(() => {
        const getDevices = async () => {
            try {
                const res = await fetch("/getcurrentdevices");
                if (res.ok) {
                    const data = await res.json();
                    setDevices(data.getDeviceList || []);
                }
            } catch (error) {
                console.error(error);
            }
        };
        getDevices();
    }, []);

    const handleSelectDevice = (e) => {
        if (e.target.checked) {
            const matched = devices.filter(
                (d) => d.id === parseInt(e.target.dataset.deviceid)
            );
            setDeviceSelection((prev) => [...new Set([...prev, ...matched])]);
        } else {
            setDeviceSelection((prev) =>
                prev.filter((d) => d.id !== parseInt(e.target.dataset.deviceid))
            );
        }
    };

    const handleSelectAllDevices = (e) => {
        if (e.target.checked) {
            setDeviceSelection(devices);
        } else {
            setDeviceSelection([]);
        }
    };

    // Keep only digits and a single decimal point so letters can never be typed.
    const sanitizeNumeric = (v) =>
        v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setUnifiSubmissionError({});
        setSubmissionError({});

        if (!deviceSelection.length) {
            setSubmissionError({ message: "Please select at least one target device." });
            if (errorDialogRef.current) errorDialogRef.current.showModal();
            return;
        }

        const download = Number(downloadMbps);
        const upload = Number(uploadMbps);
        if (!Number.isFinite(download) || !Number.isFinite(upload) || download <= 0 || upload <= 0) {
            setSubmissionError({ message: "Download and upload limits must be positive numbers (Mbps)." });
            if (errorDialogRef.current) errorDialogRef.current.showModal();
            return;
        }

        // Convert Mbps -> kbps (UniFi uses kbps internally).
        const downloadKbps = download * 1000;
        const uploadKbps = upload * 1000;

        const selectedDevices = deviceSelection.map((device) => ({
            id: device.id,
            name: device.name,
            macAddress: device.macAddress,
        }));

        setLoading(true);
        try {
            const res = await fetch("/addspeedlimittrafficrule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    description: description.trim(),
                    enabled,
                    downloadKbps,
                    uploadKbps,
                    devices: selectedDevices,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setUnifiSubmissionError({ message: data.error?.message || "UniFi rejected the rule." });
                if (unifiErrorDialogRef.current) unifiErrorDialogRef.current.showModal();
                return;
            }
            handleClose();
            onSuccess && onSuccess();
        } catch (error) {
            setUnifiSubmissionError({ message: error.message || "Something went wrong." });
            if (unifiErrorDialogRef.current) unifiErrorDialogRef.current.showModal();
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle" id="speedLimitModal">
            <div className="modal-box bg-base-100 rounded-2xl border border-base-300 shadow-xl max-w-2xl w-full">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <HiBolt className="w-5 h-5 text-primary" />
                        <h2 className="font-bold text-lg">New Speed Limit Rule</h2>
                    </div>
                    <button onClick={handleClose} className="btn btn-ghost btn-sm btn-circle">
                        <HiXMark className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Description */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Rule description</span>
                        </label>
                        <input
                            ref={descriptionRef}
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Cap Xbox at 50 Mbps"
                            className="input input-bordered w-full"
                        />
                    </div>

                    {/* Download / Upload limits */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Download limit (Mbps)</span>
                            </label>
                            <input
                                ref={downloadRef}
                                type="text"
                                inputMode="decimal"
                                value={downloadMbps}
                                onChange={(e) => setDownloadMbps(sanitizeNumeric(e.target.value))}
                                placeholder="e.g. 50"
                                className="input input-bordered w-full"
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Upload limit (Mbps)</span>
                            </label>
                            <input
                                ref={uploadRef}
                                type="text"
                                inputMode="decimal"
                                value={uploadMbps}
                                onChange={(e) => setUploadMbps(sanitizeNumeric(e.target.value))}
                                placeholder="e.g. 25"
                                className="input input-bordered w-full"
                            />
                        </div>
                    </div>

                    {/* Enabled toggle */}
                    <div className="form-control">
                        <label className="label cursor-pointer justify-start gap-3">
                            <span className="label-text">Rule enabled</span>
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="toggle toggle-primary toggle-sm"
                            />
                        </label>
                    </div>

                    {/* Target devices */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Target devices</span>
                        </label>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs opacity-70">Select the devices this speed limit applies to.</span>
                            <label className="label cursor-pointer gap-2">
                                <span className="label-text">Select all</span>
                                <input
                                    type="checkbox"
                                    checked={deviceSelection.length === devices.length && devices.length > 0}
                                    onChange={handleSelectAllDevices}
                                    className="checkbox checkbox-sm"
                                />
                            </label>
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1 border rounded-xl p-2">
                            {devices.length === 0 && (
                                <p className="text-sm opacity-60">No devices available.</p>
                            )}
                            {devices.map((device) => {
                                const isSelected = deviceSelection.some(
                                    (d) => d.id === device.id
                                );
                                return (
                                    <label
                                        key={device.id}
                                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                            isSelected
                                                ? "bg-accent/10 border border-accent"
                                                : "hover:bg-base-200 border border-transparent"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                            data-deviceid={device.id}
                                            onChange={handleSelectDevice}
                                            checked={isSelected}
                                        />
                                        <HiDevicePhoneMobile className="w-4 h-4 opacity-60" />
                                        <span className="text-sm">{device.name || device.macAddress}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Submit */}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="btn btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                        >
                            {loading ? <span className="loading loading-spinner loading-sm" /> : <HiShieldCheck className="w-4 h-4" />}
                            {loading ? "Creating..." : "Create speed limit"}
                        </button>
                    </div>
                </form>
            </div>

            {/* UniFi submission error dialog */}
            <dialog ref={unifiErrorDialogRef} className="modal">
                <div className="modal-box bg-base-100 rounded-2xl">
                    <h3 className="font-bold text-lg mb-2">Speed limit creation failed</h3>
                    <p>{unifiSubmissionError.message || "Something went wrong."}</p>
                    <div className="modal-action">
                        <button className="btn btn-ghost" onClick={() => unifiErrorDialogRef.current?.close()}>
                            Close
                        </button>
                    </div>
                </div>
            </dialog>

            {/* Validation error dialog */}
            <dialog ref={errorDialogRef} className="modal">
                <div className="modal-box bg-base-100 rounded-2xl">
                    <h3 className="font-bold text-lg mb-2">Check your input</h3>
                    <p>{submissionError.message || "Please fix the highlighted fields."}</p>
                    <div className="modal-action">
                        <button className="btn btn-ghost" onClick={() => errorDialogRef.current?.close()}>
                            Close
                        </button>
                    </div>
                </div>
            </dialog>
        </dialog>
    );
}

SpeedLimitModal.propTypes = {
    dialogRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
    onSuccess: PropTypes.func,
};
