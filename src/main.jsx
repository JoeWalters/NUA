import React, { Suspense, lazy } from 'react';
import App from './App.jsx';
import './index.css';
import NotFound from './components/NotFound.jsx';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter, Routes, Route
} from 'react-router-dom';
import './globals.css'

// Route-level code splitting: heavy screens are loaded on demand instead of
// shipping in the initial bundle.
const AdminConsole = lazy(() => import('./components/AdminConsole.jsx'));
const BlockedDevices = lazy(() => import('./components/blocked_device/BlockedDevices.jsx'));


const root = createRoot(document.getElementById('root'));



root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="flex items-center justify-center h-full w-full">Loading...</div>}>
        <Routes>
          <Route path="/" element={<App />}>
            {/* <Route path="/" element={<Login />} /> */}
            <Route path="/" element={<AdminConsole />} />
            <Route path="/blockeddevices" element={<BlockedDevices />} />
            {/* <Route path="/admin/:id/scheduler" element={<Scheduler />} /> */}
            {/* <Route path="/admin/:id/cronmanager" element={<CronManager />} /> */}
            {/* <Route path="/admin/:id/easysched" element={<EasySched />} /> */}
            <Route path="*" element={<NotFound />} />
            {/* <Route path="/adminconsole" element={<AdminConsole />} /> */}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
