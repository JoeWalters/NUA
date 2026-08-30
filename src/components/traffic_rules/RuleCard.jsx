import { useState } from "react";
import PropTypes from 'prop-types';
import RuleBonusTimeButton from "../utility_components/RuleBonusTimeButton";
import RuleScheduleButton from "../utility_components/RuleScheduleButton";
import {
    HiShieldCheck,
    HiTrash,
    HiCpuChip,
    HiMiniPencilSquare,
    HiDevicePhoneMobile,
} from "react-icons/hi2";

export default function RuleCard({ data, onToggle, onDelete, onUnmanage, onEdit, rawRule, onStateChange, loadingUnmanageApp, ruleTags }) {
    const [expanded, setExpanded] = useState(false);
    const enabled = data?.trafficRule.enabled;
    const bonusTimeActive = data?.trafficRule.bonusTimeActive || false;

    const getCardBorderClasses = (isEnabled) => {
        return `border border-base-300 relative ${isEnabled ? 'border-success' : 'border-error'}`;
    };

    const getAccentBorderColor = (isEnabled) => {
        if (isEnabled) return '#10B981'; // green-500
        return '#EF4444'; // red-500
    };

    return (
        <li className="list-none">
            <div className={`bg-white dark:bg-base-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group ${getCardBorderClasses(enabled)}`}>
                {/* Stylized top accent border */}
                <div
                    className="absolute top-0 left-0 w-1/3 h-1 rounded-tl-xl"
                    style={{ backgroundColor: getAccentBorderColor(enabled) }}
                ></div>

                {/* Card Header */}
                <div className="p-6 pb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex-shrink-0 p-2 rounded-lg bg-base-200 text-base-content/70">
                                <HiShieldCheck className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-semibold text-base-content truncate" title={data?.trafficRule.description}>
                                    {data?.trafficRule.description}
                                </h3>
                                <p className="text-sm text-base-content/60">Traffic Rule</p>
                                <div className="mt-1 min-h-6">
                                    <div className="flex items-center gap-2 text-xs text-base-content/60">
                                        <span className="badge badge-ghost badge-sm gap-1">
                                            <HiCpuChip className="w-3.5 h-3.5" />
                                            {data?.matchingAppIds?.length || 0}
                                        </span>
                                        <span className="badge badge-ghost badge-sm gap-1">
                                            <HiDevicePhoneMobile className="w-3.5 h-3.5" />
                                            {data?.matchingTargetDevices?.length || 0}
                                        </span>
                                    </div>
                                    {/* Tag chips */}
                                    {ruleTags?.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 mt-1">
                                            {ruleTags.map(tag => (
                                                <span
                                                    key={tag.id}
                                                    className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                                                    style={{
                                                        backgroundColor: tag.color + '20',
                                                        color: tag.color
                                                    }}
                                                >
                                                    <span>{tag.icon}</span>
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Row */}
                    <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={enabled}
                                className={`toggle toggle-sm ${enabled ? 'toggle-success' : 'toggle-error'}`}
                                onClick={onToggle}
                                data-unifiruleid={data.trafficRule.unifiId}
                                data-dbtrafficruleid={data.trafficRule.id}
                                onChange={() => {}}
                                title={enabled ? 'Disable this rule' : 'Enable this rule'}
                            />
                            <span className="text-sm text-base-content/70" title={enabled ? 'This rule is currently enabled' : 'This rule is currently disabled'}>
                                {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <RuleBonusTimeButton
                                trafficRuleId={data?.trafficRule.id}
                                bonusTimeActive={bonusTimeActive}
                                onStateChange={onStateChange}
                            />
                            <RuleScheduleButton
                                trafficRuleId={data?.trafficRule.id}
                                scheduleData={data?.trafficRule}
                                onStateChange={onStateChange}
                            />
                        </div>

                        <div className="flex items-center space-x-2">
                            <button
                                className="btn btn-ghost btn-xs"
                                onClick={() => setExpanded(prev => !prev)}
                                aria-label="Expand rule details"
                            >
                                {expanded ? 'Less' : 'More'}
                            </button>
                            <button
                                className="btn btn-ghost btn-xs text-base-content/50 hover:text-primary"
                                onClick={() => onEdit(data, rawRule)}
                                data-trafficruleid={data?.trafficRule?.id}
                                title="Edit Rule"
                            >
                                <HiMiniPencilSquare className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Expanded detail section */}
                {expanded && (
                    <div className="px-6 pb-6 pt-2 border-t border-base-300 bg-base-200/50 flex flex-col gap-4">
                        {data?.matchingAppIds?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Apps</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {data.matchingAppIds.map((appId) => (
                                        <span key={appId?.app_name} className="badge badge-primary badge-sm">{appId?.app_name}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {data?.matchingTargetDevices?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Devices</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {data.matchingTargetDevices.map((device) => (
                                        <span key={device.client_mac} className="badge badge-accent badge-sm">{device.client_mac}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                className={`btn btn-sm flex-1 gap-1 ${loadingUnmanageApp ? 'btn-disabled' : 'btn-outline'}`}
                                onClick={onUnmanage}
                                data-trafficruleid={data?.trafficRule.id}
                                disabled={loadingUnmanageApp}
                            >
                                {loadingUnmanageApp
                                    ? <span className="loading loading-spinner loading-xs"></span>
                                    : 'Unmanage'
                                }
                            </button>
                            <button
                                className="btn btn-error btn-outline btn-sm gap-1 flex-1"
                                onClick={onDelete}
                                data-trafficid={data?.trafficRule.unifiId}
                                data-trafficruleid={data?.trafficRule.id}
                            >
                                <HiTrash className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </li>
    );
}

RuleCard.propTypes = {
    data: PropTypes.shape({
        trafficRule: PropTypes.shape({
            enabled: PropTypes.bool,
            bonusTimeActive: PropTypes.bool,
            description: PropTypes.string,
            unifiId: PropTypes.string,
            id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
         }),
        matchingAppIds: PropTypes.array,
        matchingTargetDevices: PropTypes.array,
     }),
    onToggle: PropTypes.func,
    onDelete: PropTypes.func,
    onUnmanage: PropTypes.func,
    onEdit: PropTypes.func,
    rawRule: PropTypes.object,
    onStateChange: PropTypes.func,
    loadingUnmanageApp: PropTypes.bool,
    ruleTags: PropTypes.array,
};
