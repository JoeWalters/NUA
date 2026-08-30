import { useRef } from "react";
import ModernDeviceGrid from "./modern_devices/ModernDeviceGrid";
import DeviceGroupManager from "./DeviceGroupManager";
import DeviceModals from "./DeviceModals";
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

            {/* Modals */}
            <DeviceModals
                editRef={editRef}
                newDeviceNameRef={newDeviceNameRef}
                newMacAddressRef={newMacAddressRef}
                updatedDeviceData={updatedDeviceData}
                handleEditInput={handleEditInput}
                handleSaveEdits={handleSaveEdits}
                handleClose={handleClose}
                loading={loading}
                deleteConfirmRef={deleteConfirmRef}
                handleConfirmDelete={handleConfirmDelete}
                toggleLoadingDialogRef={toggleLoadingDialogRef}
                schedulerOpen={schedulerOpen}
                selectedDeviceForScheduler={selectedDeviceForScheduler}
                closeScheduler={closeScheduler}
                handleRenderToggle={handleRenderToggle}
                toastMessage={toastMessage}
            />
        </div>
    );
}
