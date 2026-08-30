import PropTypes from 'prop-types';
import { useTrafficRules } from "../custom_hooks/useTrafficRules";
import GenericPageSkeleton from "../skeletons/GenericPageSkeleton";
import RuleCard from "./RuleCard";
import RuleModals from "./RuleModals";
import {
    HiShieldCheck,
    HiPlus,
    HiArrowDownTray,
    HiBolt,
} from "react-icons/hi2";


export default function TrafficRules({ embedded = false })
{
    const {
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
    } = useTrafficRules();

    const containerClass = embedded
        ? 'flex flex-col w-full px-4 sm:px-6 lg:px-8 py-6 gap-6'
        : 'flex flex-col w-full sm:w-3/4 lg:w-1/2 mx-auto px-4 pb-12 pt-4 gap-6';

    return (
        <>
            {pageLoading && <GenericPageSkeleton rows={4} />}
            {!pageLoading && (
                <div className={containerClass}>

                    {/* Page header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <HiShieldCheck className="w-6 h-6 text-primary" />
                            <h1 className="text-2xl font-bold text-base-content">Traffic Rules</h1>
                            {customAPIRules.length > 0 && (
                                <span className="badge badge-primary badge-sm ml-1">{customAPIRules.length}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {importOption ? (
                                <button
                                    className="btn btn-sm btn-ghost gap-1"
                                    onClick={handleImportModalOpen}
                                >
                                    <HiArrowDownTray className="w-4 h-4" />
                                    Import
                                </button>
                            ) : (
                                <button className="btn btn-sm btn-ghost gap-1 btn-disabled" disabled>
                                    <HiArrowDownTray className="w-4 h-4" />
                                    Import
                                </button>
                            )}
                            <button
                                className="btn btn-sm btn-primary gap-1"
                                onClick={() => createRuleDialogRef.current.showModal()}
                            >
                                <HiPlus className="w-4 h-4" />
                                New Rule
                            </button>
                            <button
                                className="btn btn-sm btn-outline btn-primary gap-1"
                                onClick={() => speedLimitDialogRef.current.showModal()}
                            >
                                <HiBolt className="w-4 h-4" />
                                Speed Limit
                            </button>
                        </div>
                    </div>

                    {/* Rule cards */}
                    {customAPIRules.length ? (
                        <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] m-0 p-0">
                            {customAPIRules.map((data) => (
                                <RuleCard
                                    key={data?.trafficRule.unifiId}
                                    data={data}
                                    onToggle={handleToggle}
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
                    ) : (
                        <div className="bg-white dark:bg-base-200 border border-base-300 rounded-xl shadow-sm p-10 flex flex-col items-center gap-3 text-base-content/50">
                            <HiShieldCheck className="w-10 h-10" />
                            <p className="text-sm">No rules yet. Create or import a rule to get started.</p>
                        </div>
                    )}
                </div>
            )}

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
        </>
    );
}

TrafficRules.propTypes = {
    embedded: PropTypes.bool,
};
