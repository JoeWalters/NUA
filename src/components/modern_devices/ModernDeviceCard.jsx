import { useState } from "react";
import { Link } from "react-router-dom";
import { HiMiniPencilSquare, HiWifi, HiSignal } from "react-icons/hi2";
import { 
    HiOutlineDesktopComputer, 
    HiOutlineDeviceMobile, 
    HiOutlineDeviceTablet 
} from "react-icons/hi";
import BonusTimeButton from "../utility_components/BonusTimeButton";

export default function ModernDeviceCard({ 
    device, 
    onToggle, 
    onEdit, 
    onDelete, 
    timerCancelled, 
    timerHandler, 
    handleRenderToggle 
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Determine device type icon based on name or mac address patterns
    const getDeviceIcon = (device) => {
        const name = device?.name?.toLowerCase() || '';
        const hostname = device?.hostname?.toLowerCase() || '';
        
        if (name.includes('phone') || name.includes('mobile') || hostname.includes('phone')) {
            return <HiOutlineDeviceMobile className="w-6 h-6" />;
        } else if (name.includes('tablet') || name.includes('ipad') || hostname.includes('tablet')) {
            return <HiOutlineDeviceTablet className="w-6 h-6" />;
        } else {
            return <HiOutlineDesktopComputer className="w-6 h-6" />;
        }
    };

    // Get status color classes
    const getStatusColor = (active, bonusTimeActive) => {
        if (active && bonusTimeActive) return 'text-blue-500 bg-blue-50 border-blue-200';
        if (active) return 'text-green-500 bg-green-50 border-green-200';
        return 'text-red-500 bg-red-50 border-red-200';
    };

    // Get status text
    const getStatusText = (active, bonusTimeActive) => {
        if (active && bonusTimeActive) return 'Bonus Time';
        if (active) return 'Allowed';
        return 'Blocked';
    };

    return (
        <div className="bg-white dark:bg-base-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 overflow-hidden group">
            {/* Card Header */}
            <div className="p-6 pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {/* Device Icon */}
                        <div className="flex-shrink-0 p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {getDeviceIcon(device)}
                        </div>
                        
                        {/* Device Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                                {device?.name || device?.macAddress || 'Unknown Device'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {device?.macAddress}
                            </p>
                            {/* Reserve space for group badge so toggle/controls don't shift */}
                            <div className="mt-1 min-h-6">
                                {device?.deviceGroup ? (
                                    <div className="flex items-center gap-1">
                                        <span 
                                            className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                                            style={{ 
                                                backgroundColor: device.deviceGroup.color + '20',
                                                color: device.deviceGroup.color 
                                            }}
                                        >
                                            <span>{device.deviceGroup.icon}</span>
                                            {device.deviceGroup.name}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="invisible">placeholder</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className={`
                        flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium border
                        ${getStatusColor(device?.active, device?.bonusTimeActive)}
                    `}>
                        <div className="w-2 h-2 rounded-full bg-current"></div>
                        <span>{getStatusText(device?.active, device?.bonusTimeActive)}</span>
                    </div>
                </div>

                {/* Quick Actions Row */}
                <div className="flex items-center justify-between mt-4">
                    {/* Main Toggle */}
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            className={`toggle toggle-sm ${
                                device?.active && device?.bonusTimeActive 
                                    ? "toggle-info" 
                                    : device?.active 
                                        ? "toggle-success" 
                                        : "toggle-error"
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle(device?.id);
                            }}
                            checked={device?.active || false}
                            readOnly
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {device?.active ? 'Allow' : 'Block'}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="btn btn-ghost btn-xs"
                        >
                            {isExpanded ? 'Less' : 'More'}
                        </button>
                        
                        <button
                            onClick={() => onEdit(device?.id)}
                            className="btn btn-ghost btn-xs text-gray-500 hover:text-blue-600"
                            title="Edit Device"
                        >
                            <HiMiniPencilSquare className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {/* Device Details Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Name:</span>
                            <p className="font-medium text-gray-900 dark:text-white mt-1 break-words">
                                {device?.name || 'Not set'}
                            </p>
                        </div>
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Status:</span>
                            <p className={`font-medium mt-1 ${
                                device?.active ? 'text-green-600' : 'text-red-600'
                            }`}>
                                {device?.active ? 'Allowed' : 'Blocked'}
                            </p>
                        </div>
                    </div>

                    {/* Bonus Time Section */}
                    <div className="mb-4">
                        <BonusTimeButton
                            deviceId={device?.id}
                            timerCancelled={timerCancelled}
                            timerHandler={timerHandler}
                            bonusTimeActive={device?.bonusTimeActive}
                            handleRenderToggle={handleRenderToggle}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Link 
                            to={`/admin/${device?.id}/scheduler`} 
                            className="flex-1"
                        >
                            <button className="btn btn-outline btn-sm w-full">
                                Schedule
                            </button>
                        </Link>
                        
                        <button
                            onClick={() => onDelete(device?.id)}
                            className="btn btn-error btn-outline btn-sm flex-1"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}