import PropTypes from 'prop-types';
import LoadingDialog from "./utility_components/LoadingDialog";
import SchedulerModal from "./Scheduler/SchedulerModal.jsx";

// Shared renderer for every device modal (edit / delete confirm / loading /
// scheduler / error toast). Used by both the ModernDevices view and the
// unified PolicyList, fed from useDeviceActions().
export default function DeviceModals({
    editRef,
    newDeviceNameRef,
    newMacAddressRef,
    updatedDeviceData,
    handleEditInput,
    handleSaveEdits,
    handleClose,
    loading,
    deleteConfirmRef,
    handleConfirmDelete,
    toggleLoadingDialogRef,
    schedulerOpen,
    selectedDeviceForScheduler,
    closeScheduler,
    handleRenderToggle,
    toastMessage,
}) {
    return (
        <>
            {/* Edit Device Modal */}
            <dialog className="modal" ref={editRef}>
                <div className="modal-box">
                    <h3 className="font-bold text-lg mb-4">Edit Device</h3>

                    <div className="space-y-4">
                        <div>
                            <label className="label">
                                <span className="label-text">Device Name</span>
                            </label>
                            <input
                                ref={newDeviceNameRef}
                                type="text"
                                name="name"
                                placeholder="Enter device name"
                                className="input input-bordered w-full"
                                defaultValue={updatedDeviceData?.name || ''}
                                onChange={handleEditInput}
                            />
                        </div>

                        <div>
                            <label className="label">
                                <span className="label-text">MAC Address</span>
                            </label>
                            <input
                                ref={newMacAddressRef}
                                type="text"
                                name="macAddress"
                                placeholder="Enter MAC address"
                                className="input input-bordered w-full"
                                defaultValue={updatedDeviceData?.macAddress || ''}
                                onChange={handleEditInput}
                            />
                        </div>
                    </div>

                    <div className="modal-action">
                        <button className="btn btn-ghost" onClick={handleClose}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleSaveEdits} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button onClick={handleClose}>close</button>
                </form>
            </dialog>

            <LoadingDialog toggleLoadingDialogRef={toggleLoadingDialogRef} />

            {/* Delete Confirmation Modal */}
            <dialog className="modal" ref={deleteConfirmRef}>
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Delete Device</h3>
                    <p className="py-4">Are you sure you want to delete this device? This action cannot be undone.</p>
                    <div className="modal-action">
                        <button className="btn btn-ghost" onClick={() => deleteConfirmRef.current.close()}>Cancel</button>
                        <button className="btn btn-error" onClick={handleConfirmDelete}>Delete</button>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop"><button>close</button></form>
            </dialog>

            {/* Scheduler Modal */}
            <SchedulerModal
                deviceId={selectedDeviceForScheduler?.id}
                deviceName={selectedDeviceForScheduler?.name}
                isOpen={schedulerOpen}
                onClose={closeScheduler}
                triggerRender={handleRenderToggle}
            />

            {/* Error Toast */}
            {toastMessage && (
                <div className="toast toast-bottom toast-center z-50">
                    <div className="alert alert-error">
                        <span>{toastMessage}</span>
                    </div>
                </div>
            )}
        </>
    );
}

DeviceModals.propTypes = {
    editRef: PropTypes.object,
    newDeviceNameRef: PropTypes.object,
    newMacAddressRef: PropTypes.object,
    updatedDeviceData: PropTypes.object,
    handleEditInput: PropTypes.func,
    handleSaveEdits: PropTypes.func,
    handleClose: PropTypes.func,
    loading: PropTypes.bool,
    deleteConfirmRef: PropTypes.object,
    handleConfirmDelete: PropTypes.func,
    toggleLoadingDialogRef: PropTypes.object,
    schedulerOpen: PropTypes.bool,
    selectedDeviceForScheduler: PropTypes.object,
    closeScheduler: PropTypes.func,
    handleRenderToggle: PropTypes.func,
    toastMessage: PropTypes.string,
};
