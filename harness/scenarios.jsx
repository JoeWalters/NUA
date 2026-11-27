// Named component trees the harness can mount. Each one is the real component
// with fixture props — nothing here re-implements UI.
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import ModernDeviceCard from '../src/components/modern_devices/ModernDeviceCard.jsx';
import PolicyList from '../src/components/PolicyList.jsx';
import Scheduler from '../src/components/Scheduler/Scheduler.jsx';
import AdminConsole from '../src/components/AdminConsole.jsx';
import Navbar from '../src/components/Navbar.jsx';
import AllDevicesCard from '../src/components/all_devices/AllDevicesCard.jsx';
import AddDeviceModal from '../src/components/AddDeviceModal.jsx';
import ActivityLog from '../src/components/ActivityLog.jsx';

import { devices, blockedUsers } from './fixtures.js';

const noop = () => {};

// A device grid: exercises ModernDeviceCard plus the pause / bonus controls.
export function DevicesScenario() {
    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-4">Devices</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((device) => (
                    <ModernDeviceCard
                        key={device.id}
                        device={device}
                        onToggle={noop}
                        onEdit={noop}
                        onDelete={noop}
                        onScheduleClick={noop}
                        timerCancelled={false}
                        timerHandler={noop}
                        handleRenderToggle={noop}
                        showToast={noop}
                    />
                ))}
            </div>
        </div>
    );
}

export function PoliciesScenario() {
    return (
        <PolicyList
            macData={devices}
            blockedUsers={blockedUsers}
            handleRenderToggle={noop}
            onDeviceUpdated={noop}
            loadingMacData={false}
        />
    );
}

export function SchedulerScenario() {
    // Scheduler and ScheduleData read :id from the route, so mount it under the
    // same path the app uses (main.jsx rewrites the URL to match before render).
    return (
        <Routes>
            <Route path="/admin/:id/scheduler" element={<Scheduler />} />
        </Routes>
    );
}

export function ConsoleScenario() {
    return <AdminConsole />;
}

// The all-devices screen: a grid of controller clients not yet on the device
// list, each with the "enter a name" dialog.
export function AllDevicesScenario() {
    const props = [
        { _id: 'all-1', mac: 'aa:bb:cc:dd:ee:11', oui: 'Apple, Inc.', hostname: 'ipad-new', name: 'ipad-new', last_ip: '192.168.0.21', is_online: true, is_wired: false, note: null },
        { _id: 'all-2', mac: 'aa:bb:cc:dd:ee:12', oui: 'HP Inc.', hostname: 'office-printer', name: 'office-printer', last_ip: '192.168.0.22', is_online: false, is_wired: true, note: null },
        { _id: 'all-3', mac: 'not-a-mac', oui: 'Unknown', hostname: null, name: null, last_ip: null, is_online: false, is_wired: false, note: null }
    ];
    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-4">All devices</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {props.map((p, i) => (
                    <AllDevicesCard key={p._id} props={p} length={i + 1} handleAddToDevices={noop} />
                ))}
            </div>
        </div>
    );
}

// The Add Device modal on its own, so its search and filter controls can be
// inspected without opening it through the policy list.
export function AddDeviceScenario() {
    const ref = React.useRef();
    // AddDeviceModal exposes { open } through useImperativeHandle.
    React.useEffect(() => { ref.current?.open?.(); }, []);
    return <AddDeviceModal dialogRef={ref} onAdded={noop} />;
}

export function ShellScenario() {
    return (
        <div>
            <Navbar
                themeValue="light"
                callBackChanged={noop}
                onSettingsClick={noop}
                onLogout={noop}
                showLogout
                onHealthToggle={noop}
                onActivityLogClick={noop}
            />
            <main className="p-4">
                <h1 className="text-xl font-bold">Shell</h1>
                <ActivityLog onClose={noop} />
            </main>
        </div>
    );
}
