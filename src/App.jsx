import { Outlet, useLocation } from "react-router-dom";
import Navbar from './components/Navbar.jsx'
import Login from './components/Login.jsx'
import { useEffect, useState, useRef } from "react";
import BreadCrumbs from "./components/breadcrumbs/BreadCrumbs.jsx";
import SiteSettings from "./components/SiteSettings.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import { applyTheme, cacheTheme } from './utility_functions/applyTheme.js';


export default function App() {

    const [themeValue, setThemeValue] = useState('');
    const [changed, setChanged] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [syncBannerOpen, setSyncBannerOpen] = useState(false);
    const [auth, setAuth] = useState({ enabled: false, authenticated: false });
    const location = useLocation();
    const activityLogRef = useRef();

    const toggleSyncBanner = () => setSyncBannerOpen(prev => !prev);

    const callBackChanged = () => {
      setChanged(prev => !prev)
    }

  // Optional authentication: check /auth-status. When enabled and not
  // logged in, render the Login screen instead of the main app.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/auth-status');
        const data = await res.json();
        setAuth({ enabled: !!data.enabled, authenticated: !!data.authenticated });
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
        setAuth({ enabled: false, authenticated: false });
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/logout', { method: 'POST' });
      setAuth((prev) => ({ ...prev, authenticated: false }));
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };


  useEffect(() => { // get theme settings
    const getThemeSettings = async () => {
      try {
        const getTheme = await fetch('/getcurrenttheme');
      if (getTheme.ok) {
        const currentTheme = await getTheme.json();
        applyTheme(currentTheme);
        cacheTheme(currentTheme);
        setThemeValue(currentTheme);
      }
      } catch (error) {
        console.error('Failed to fetch current theme:', error);
      }
    }
    getThemeSettings();
  }, [changed]);

  if (auth.enabled && !auth.authenticated) {
    return <Login onLogin={() => setAuth((prev) => ({ ...prev, authenticated: true }))} />;
  }

  return (
    <>
      <Navbar themeValue={themeValue} callBackChanged={callBackChanged} onSettingsClick={() => setSettingsOpen(true)} onLogout={handleLogout} showLogout={auth.enabled} onHealthToggle={toggleSyncBanner} onActivityLogClick={() => activityLogRef.current?.open()} />
      {location.pathname !== '/' && <BreadCrumbs />}
      <div key={location.pathname} className="page-enter w-full">
        <Outlet context={{ openSettings: () => setSettingsOpen(true), syncBannerOpen, onToggleSyncBanner: toggleSyncBanner }} />
      </div>
      <SiteSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ActivityLog ref={activityLogRef} />
    </>
  )
}
