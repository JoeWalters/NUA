import { useRef } from "react";
import ModernDeviceGrid from "./modern_devices/ModernDeviceGrid";
import LoadingDialog from "./utility_components/LoadingDialog";
import DeviceGroupManager from "./DeviceGroupManager";
import SchedulerModal from "./Scheduler/SchedulerModal.jsx";
import { useDeviceActions } from "./custom_hooks/useDeviceActions";

export default function ModernDevices({ macData, blockedUsers, handleRenderToggle, loadingMacData }) {
    // Tag management is opened on demand from the device filter bar; the group
    // manager keeps its (heavy) modals mounted but renders nothing on the page.
    const groupManagerRef = useRef();

    const {
        loading,
        updatedDeviceData,
        timerCancelled,
        toastMessage,
        schedulerOpen,
        selectedDeviceForScheduler,
        editRef,
        deleteConfirmRef,
        toggleLoadingDialogRef,
        newDeviceNameRef,
        newMacAddressRef,
        timerHandler,
        openSchedulerModal,
        closeScheduler,
        handleToggle,
        handleDelete,
        handleConfirmDelete,
        openEditDialog,
        handleClose,
        handleEditInput,
        handleSaveEdits,
        handleBlockAll,
        handleUnBlockAll,
    } = useDeviceActions({ macData, blockedUsers, onDataChange: handleRenderToggle });

    return (
        <div className="space-y-6">
            {/* Tags Management — no visible section; opened via the filter bar */}
            <DeviceGroupManager
                ref={groupManagerRef}
                devices={macData}
                onGroupsUpdate={handleRenderToggle}
            />

            {/* Device Grid */}
            <ModernDeviceGrid
                devices={macData}
                loading={loadingMacData}
                onToggle={handleToggle}
                onEdit={openEditDialog}
                onDelete={handleDelete}
                onScheduleClick={openSchedulerModal}
                timerCancelled={timerCancelled}
                timerHandler={timerHandler}
                handleRenderToggle={handleRenderToggle}
                onBlockAll={handleBlockAll}
                onUnblockAll={handleUnBlockAll}
                onManageTags={() => groupManagerRef.current?.openManager()}
            />

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
                        <button
                            className="btn btn-ghost"
                            onClick={handleClose}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveEdits}
                            disabled={loading}
                        >
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
        </div>
    );
}
