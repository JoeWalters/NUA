// Client-side debug mode.
//
// Debug mode is a per-browser toggle that can be enabled from Site Settings in
// the GUI. When off (the default), informational console.log calls are silenced
// across the app. When on, they are restored to help trace issues.
//
// Errors (console.error) always print regardless of this flag.
const STORAGE_KEY = 'nua-debug-mode';

let debugMode = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
})();

export function setDebugMode(enabled) {
  debugMode = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore storage errors */
  }
}

export function isDebugEnabled() {
  return debugMode;
}

// Gate informational logs behind debug mode. Errors are always logged.
export function debugLog(...args) {
  if (debugMode) {
    console.log(...args);
  }
}
