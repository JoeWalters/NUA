import PropTypes from 'prop-types';
import CreateRuleModal from "./CreateRuleModal";
import EditRuleModal from "./EditRuleModal";
import SpeedLimitModal from "./SpeedLimitModal";
import { HiArrowDownTray } from "react-icons/hi2";

// Shared renderer for every traffic-rule modal (create / speed limit / edit /
// import). Both the standalone TrafficRules screen and the unified PolicyList
// render this with the state/handlers from useTrafficRules().
export default function RuleModals({
    createRuleDialogRef,
    speedLimitDialogRef,
    editRuleDialogRef,
    editingRule,
    editingRawRule,
    editingCategoryName,
    reRender,
    importDialogRef,
    importRuleChoices,
    importRuleSelection,
    checked,
    handleSelectedImport,
    handleImportModalClose,
    handleImportOption,
    loadingImportSubmission,
}) {
    return (
        <>
            <CreateRuleModal dialogRef={createRuleDialogRef} onSuccess={reRender} />

            <SpeedLimitModal dialogRef={speedLimitDialogRef} onSuccess={reRender} />

            <EditRuleModal
                dialogRef={editRuleDialogRef}
                rule={editingRule}
                rawRule={editingRawRule}
                categoryName={editingCategoryName}
                onSuccess={reRender}
            />

            {/* Import modal */}
            <dialog ref={importDialogRef} className="modal">
                <div className="modal-box max-w-lg">
                    <div className="flex items-center gap-2 mb-5">
                        <HiArrowDownTray className="w-5 h-5 text-accent" />
                        <h3 className="font-bold text-lg">Import UniFi Rules</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                        {importRuleChoices.map((data) => (
                            <label
                                key={data._id}
                                className="flex items-start gap-4 p-4 rounded-xl border border-base-300 bg-base-200 hover:border-accent cursor-pointer transition-colors"
                            >
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-accent mt-0.5 flex-shrink-0"
                                    onClick={e => handleSelectedImport(e, data._id)}
                                    data-id={data._id}
                                    checked={checked[data?._id] || false}
                                    onChange={() => {}}
                                />
                                <div className="flex flex-col gap-1 min-w-0">
                                    <span className="font-semibold text-base-content truncate">{data.description}</span>
                                    <span className="text-xs text-base-content/50">Target: {data.matching_target}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-between mt-6">
                        <button className="btn btn-ghost" onClick={handleImportModalClose}>Cancel</button>
                        <button
                            className="btn btn-primary"
                            onClick={handleImportOption}
                            disabled={!importRuleSelection.length || loadingImportSubmission}
                        >
                            {loadingImportSubmission
                                ? <span className="loading loading-spinner loading-sm"></span>
                                : <><HiArrowDownTray className="w-4 h-4" /> Import {importRuleSelection.length > 0 && `(${importRuleSelection.length})`}</>
                            }
                        </button>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button onClick={handleImportModalClose}>close</button>
                </form>
            </dialog>
        </>
    );
}

RuleModals.propTypes = {
    createRuleDialogRef: PropTypes.object,
    speedLimitDialogRef: PropTypes.object,
    editRuleDialogRef: PropTypes.object,
    editingRule: PropTypes.object,
    editingRawRule: PropTypes.object,
    editingCategoryName: PropTypes.string,
    reRender: PropTypes.func,
    importDialogRef: PropTypes.object,
    importRuleChoices: PropTypes.array,
    importRuleSelection: PropTypes.array,
    checked: PropTypes.object,
    handleSelectedImport: PropTypes.func,
    handleImportModalClose: PropTypes.func,
    handleImportOption: PropTypes.func,
    loadingImportSubmission: PropTypes.bool,
};
