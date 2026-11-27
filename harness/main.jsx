/* eslint-disable react-refresh/only-export-components --
   this is the harness entry point: it renders once and exports nothing. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { installFetchStub } from './stubFetch.js';
import { scenarios, defaultScenario } from './scenarios.js';
import { TimerProvider } from '../src/components/providers/TimerProvider.jsx';
import { DevicesProvider } from '../src/components/providers/DevicesProvider.jsx';
// Same stylesheets as the app (src/main.jsx), so a layout measurement here means
// something: index.css carries Tailwind + daisyUI, globals.css the app's own rules.
import '../src/index.css';
import '../src/globals.css';

// ?scenario=<name> picks a tree (see scenarios.jsx); ?w=<px> pins the viewport
// width so responsive checks are reproducible without device emulation.
const params = new URLSearchParams(window.location.search);
const name = params.get('scenario') || defaultScenario;
const scenario = scenarios[name] || scenarios[defaultScenario];
const width = Number(params.get('w')) || 0;

installFetchStub();

const { Component, path } = scenario;
if (path && window.location.pathname !== path) {
    window.history.replaceState({}, '', path + window.location.search);
}

function Frame({ children }) {
    if (!width) return children;
    return (
        <div style={{ width, margin: '0 auto', outline: '1px dashed #94a3b8' }} data-harness-width={width}>
            {children}
        </div>
    );
}

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <TimerProvider>
                <DevicesProvider>
                    <Frame>
                        <Component />
                    </Frame>
                </DevicesProvider>
            </TimerProvider>
        </BrowserRouter>
    </React.StrictMode>
);

// Reported by the harness self-check and visible in the page title.
window.__harnessReady = { scenario: name, title: scenario.title, width: width || 'auto' };
document.title = `NUA harness — ${scenario.title}${width ? ` @${width}px` : ''}`;
