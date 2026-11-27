// The scenario registry. Kept apart from scenarios.jsx so the component file
// exports only components (react-refresh's lint rule) and this file exports
// only data.
import {
    DevicesScenario, PoliciesScenario, SchedulerScenario, ConsoleScenario, ShellScenario,
    AllDevicesScenario, AddDeviceScenario, DeviceDetailScenario
} from './scenarios.jsx';

export const scenarios = {
    devices: { title: 'Device cards', Component: DevicesScenario },
    policies: { title: 'Policy list (devices + rules)', Component: PoliciesScenario },
    scheduler: { title: 'Scheduler for device 1', Component: SchedulerScenario, path: '/admin/1/scheduler' },
    console: { title: 'Admin console (home screen)', Component: ConsoleScenario },
    shell: { title: 'Navbar + activity log', Component: ShellScenario },
    alldevices: { title: 'All devices (add-name dialogs)', Component: AllDevicesScenario },
    adddevice: { title: 'Add Device modal', Component: AddDeviceScenario },
    // pathPattern lets the same scenario serve /devices/1, /devices/2, … — anything
    // matching the pattern keeps the requested id instead of being rewritten.
    devicedetail: { title: 'Device detail page', Component: DeviceDetailScenario, path: '/devices/1', pathPattern: '/devices/:id' },
    devicedetail404: { title: 'Device detail page (unknown id)', Component: DeviceDetailScenario, path: '/devices/999', pathPattern: '/devices/:id' }
};

export const defaultScenario = 'devices';
