// Named component trees the harness can mount. Each one is the real component
// with fixture props — nothing here re-implements UI.
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import ModernDeviceCard from '../src/components/modern_devices/ModernDeviceCard.jsx';
import PolicyList from '../src/components/PolicyList.jsx';
import Scheduler from '../src/components/Scheduler/Scheduler.jsx';
import AdminConsole from '../src/components/AdminConsole.jsx';
import Navbar from '../src/components/Navbar.jsx';
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
