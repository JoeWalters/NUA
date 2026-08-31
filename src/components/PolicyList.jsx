import { useState, useRef } from "react";
import {
    HiMagnifyingGlass,
    HiOutlineDeviceTablet,
    HiOutlineShieldCheck,
} from "react-icons/hi2";
import { IoMdRefresh } from "react-icons/io";
import ModernDeviceCard from "./modern_devices/ModernDeviceCard";
import RuleCard from "./traffic_rules/RuleCard";
import DeviceGroupManager from "./DeviceGroupManager";
import RuleTagManager from "./RuleTagManager";
import AddDeviceModal from "./AddDeviceModal";
import DeviceModals from "./DeviceModals";
import RuleModals from "./traffic_rules/RuleModals";
import ModernDeviceSkeleton from "./skeletons/ModernDeviceSkeleton";
import { useDeviceActions } from "./custom_hooks/useDeviceActions";
import { useTrafficRules } from "./custom_hooks/useTrafficRules";

// Unified main list: devices and traffic rules live in one grid with a shared
// search / status / tag filter and a type filter, visually distinguished by
// icon + accent color + badge.
export default function PolicyList({ macData, blockedUsers, handleRenderToggle, loadingMacData }) {
    const groupManagerRef = useRef();
    const ruleTagManagerRef = useRef();
    const addDeviceModalRef = useRef();

    // Rule data + actions
    const {
        customAPIRules,
        unifiRuleObject,
        pageLoading,
        loadingUnmanageApp,
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
        importOption,
        handleImportModalOpen,
        openEditRule,
        handleImportModalClose,
        handleSelectedImport,
        handleUnmanageApp,
        reRender,
        handleToggle: handleRuleToggle,
        handleDeleteTrafficRule,
        handleImportOption,
        loadingImportSubmission,
    } = useTrafficRules();

    // Device data + actions
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
        handleToggle: handleDeviceToggle,
        handleDelete,
        handleConfirmDelete,
        openEditDialog,
        handleClose,
        handleEditInput,
        handleSaveEdits,
    } = useDeviceActions({ macData, blockedUsers, onDataChange: handleRenderToggle });

    const [typeFilter, setTypeFilter] = useState('all'); // all | devices | rules
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(true);

    // Unique device tags (groups) and rule tags for the unified tag filter
    const deviceTagOptions = [...new Map(
        (macData || [])
            .filter(d => d?.deviceGroup)
            .map(d => [d.deviceGroup.id, d.deviceGroup])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    const ruleTagOptions = [...new Map(
        (customAPIRules || [])
            .flatMap(r => r?.ruleTags || [])
            .map(t => [t.id, t])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    const filteredDevices = (macData || []).filter(device => {
        if (typeFilter === 'rules') return false;

        // search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            if (!(device?.name?.toLowerCase().includes(term) ||
                  device?.macAddress?.toLowerCase().includes(term) ||
                  device?.hostname?.toLowerCase().includes(term) ||
                  device?.deviceGroup?.name?.toLowerCase().includes(term))) {
                return false;
            }
        }
        // status
        switch (statusFilter) {
            case 'allowed': if (!device?.active) return false; break;
            case 'blocked': if (device?.active) return false; break;
            case 'bonus': if (!device?.bonusTimeActive) return false; break;
            case 'enabled': return false;
            case 'disabled': return false;
            default: break;
        }
        // tag
        if (tagFilter === 'none') { if (device?.deviceGroup) return false; }
        else if (tagFilter.startsWith('d-')) {
            if (device?.deviceGroup?.id !== parseInt(tagFilter.slice(2))) return false;
        } else if (tagFilter.startsWith('r-')) {
            return false;
        }
        return true;
    });

    const filteredRules = (customAPIRules || []).filter(rule => {
        if (typeFilter === 'devices') return false;

        // search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const desc = rule?.trafficRule?.description?.toLowerCase() || '';
            const apps = (rule?.matchingAppIds || []).map(a => a?.app_name?.toLowerCase() || '').join(' ');
            const macs = (rule?.matchingTargetDevices || []).map(d => d?.client_mac?.toLowerCase() || '').join(' ');
            if (!desc.includes(term) && !apps.includes(term) && !macs.includes(term)) return false;
        }
        // status
        switch (statusFilter) {
            case 'enabled': if (!rule?.trafficRule?.enabled) return false; break;
            case 'disabled': if (rule?.trafficRule?.enabled) return false; break;
            case 'bonus': if (!rule?.trafficRule?.bonusTimeActive) return false; break;
            case 'allowed': return false;
            case 'blocked': return false;
            default: break;
        }
        // tag
        if (tagFilter === 'none') { if ((rule?.ruleTags || []).length > 0) return false; }
        else if (tagFilter.startsWith('r-')) {
            if (!(rule?.ruleTags || []).some(t => t.id === parseInt(tagFilter.slice(2)))) return false;
        } else if (tagFilter.startsWith('d-')) {
            return false;
        }
        return true;
    });

    const total = (macData || []).length + (customAPIRules || []).length;
    const shown = filteredDevices.length + filteredRules.length;

    const handleRefresh = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setTagFilter('all');
        handleRenderToggle();
    };

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            {/* Tag managers — mounted but opened on demand from the filter bar */}
            <DeviceGroupManager ref={groupManagerRef} devices={macData} onGroupsUpdate={handleRenderToggle} />
            <RuleTagManager ref={ruleTagManagerRef} rules={customAPIRules} onRulesChange={reRender} />
            <AddDeviceModal ref={addDeviceModalRef} onAdded={handleRenderToggle} />

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-base-content">Devices & Rules</h1>
                    {total > 0 && <span className="badge badge-primary badge-sm ml-1">{total}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="btn btn-sm btn-primary gap-1"
                        onClick={() => addDeviceModalRef.current?.open()}
                    >
                        Add Device
                    </button>
                    <button
                        className="btn btn-sm btn-primary gap-1"
                        onClick={() => createRuleDialogRef.current?.showModal()}
                    >
                        New Rule
                    </button>
                    <button
                        className="btn btn-sm btn-outline btn-primary gap-1"
                        onClick={() => speedLimitDialogRef.current?.showModal()}
                    >
                        Speed Limit
                    </button>
                    {importOption ? (
                        <button
                            className="btn btn-sm btn-ghost gap-1"
                            onClick={handleImportModalOpen}
                        >
                            Import
                        </button>
                    ) : (
                        <button className="btn btn-sm btn-ghost gap-1 btn-disabled" disabled>
                            Import
                        </button>
                    )}
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="mb-6">
                {!showFilters ? (
                    <div className="text-center">
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(true)}>
                            <HiMagnifyingGlass className="w-4 h-4 mr-2" />
                            Search & Filter
                        </button>
                    </div>
                ) : (
                    <div className="bg-base-100 rounded-lg p-4 shadow-sm border border-base-300">
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            {/* Type filter */}
                            <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1">
                                <button
                                    className={`btn btn-xs gap-1 ${typeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setTypeFilter('all')}
                                >
                                    All
                                </button>
                                <button
                                    className={`btn btn-xs gap-1 ${typeFilter === 'devices' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setTypeFilter('devices')}
                                >
                                    <HiOutlineDeviceTablet className="w-3.5 h-3.5" /> Devices
                                </button>
                                <button
                                    className={`btn btn-xs gap-1 ${typeFilter === 'rules' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setTypeFilter('rules')}
                                >
                                    <HiOutlineShieldCheck className="w-3.5 h-3.5" /> Rules
                                </button>
                            </div>

                            {/* Search */}
                            <div className="flex-1 relative min-w-[160px]">
                                <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search devices and rules..."
                                    className="input input-bordered w-full pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            {/* Status filter */}
                            <select
                                className="select select-bordered min-w-[130px]"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All statuses</option>
                                <option value="allowed">Allowed</option>
                                <option value="blocked">Blocked</option>
                                <option value="enabled">Enabled</option>
                                <option value="disabled">Disabled</option>
                                <option value="bonus">Bonus time</option>
                            </select>

                            {/* Tag filter */}
                            <select
                                className="select select-bordered min-w-[130px]"
                                value={tagFilter}
                                onChange={(e) => setTagFilter(e.target.value)}
                            >
                                <option value="all">All tags</option>
                                <option value="none">No tag</option>
                                {deviceTagOptions.map(g => (
                                    <option key={`d-${g.id}`} value={`d-${g.id}`}>{g.icon} {g.name}</option>
                                ))}
                                {ruleTagOptions.map(t => (
                                    <option key={`r-${t.id}`} value={`r-${t.id}`}>{t.icon} {t.name}</option>
                                ))}
                            </select>

                            {/* Tag management */}
                            <div className="flex items-center gap-1">
                                <button
                                    className="btn btn-ghost btn-sm gap-1"
                                    title="Manage device tags"
                                    onClick={() => groupManagerRef.current?.openManager()}
                                >
                                    🏷️ Device Tags
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm gap-1"
                                    title="Manage rule tags"
                                    onClick={() => ruleTagManagerRef.current?.openManager()}
                                >
                                    🏷️ Rule Tags
                                </button>
                                <button className="btn btn-ghost btn-square" onClick={handleRefresh} title="Refresh">
                                    <IoMdRefresh className="w-5 h-5" />
                                </button>
                                <button
                                    className="btn btn-ghost btn-square"
                                    onClick={() => setShowFilters(false)}
                                    title="Hide search and filters"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Result count */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300">
                            <div className="text-sm text-base-content/60">
                                Showing {shown} of {total} items
                            </div>
                            {typeFilter !== 'all' && (
                                <div className="text-sm text-base-content/60">
                                    Type: <span className="font-medium">{typeFilter}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Unified grid */}
            {loadingMacData && pageLoading ? (
                <ModernDeviceSkeleton count={6} />
            ) : shown === 0 ? (
                <div className="text-center py-12">
                    <div className="text-base-content/40 mb-4"><HiMagnifyingGlass className="w-16 h-16 mx-auto" /></div>
                    <h3 className="text-lg font-medium text-base-content mb-2">No items found</h3>
                    <p className="text-base-content/60">Try adjusting your search, type, status, or tag filters.</p>
                </div>
            ) : (
                <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] m-0 p-0">
                    {filteredDevices.map((device) => (
                        <ModernDeviceCard
                            key={device?.id}
                            device={device}
                            onToggle={handleDeviceToggle}
                            onEdit={openEditDialog}
                            onDelete={handleDelete}
                            onScheduleClick={openSchedulerModal}
                            timerCancelled={timerCancelled}
                            timerHandler={timerHandler}
                            handleRenderToggle={handleRenderToggle}
                        />
                    ))}
                    {filteredRules.map((data) => (
                        <RuleCard
                            key={data?.trafficRule.unifiId}
                            data={data}
                            onToggle={handleRuleToggle}
                            onDelete={handleDeleteTrafficRule}
                            onUnmanage={handleUnmanageApp}
                            onEdit={openEditRule}
                            rawRule={(unifiRuleObject || []).find((r) => r._id === data?.trafficRule?.unifiId) || null}
                            onStateChange={reRender}
                            loadingUnmanageApp={loadingUnmanageApp}
                            ruleTags={data?.ruleTags || []}
                        />
                    ))}
                </ul>
            )}

            {/* Shared modals */}
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
            <RuleModals
                createRuleDialogRef={createRuleDialogRef}
                speedLimitDialogRef={speedLimitDialogRef}
                editRuleDialogRef={editRuleDialogRef}
                editingRule={editingRule}
                editingRawRule={editingRawRule}
                editingCategoryName={editingCategoryName}
                reRender={reRender}
                importDialogRef={importDialogRef}
                importRuleChoices={importRuleChoices}
                importRuleSelection={importRuleSelection}
                checked={checked}
                handleSelectedImport={handleSelectedImport}
                handleImportModalClose={handleImportModalClose}
                handleImportOption={handleImportOption}
                loadingImportSubmission={loadingImportSubmission}
            />
        </div>
    );
}
