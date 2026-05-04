import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import {
  HiHome,
  HiCog6Tooth,
  HiComputerDesktop,
  HiServer,
  HiSquares2X2,
  HiSignal,
  HiNoSymbol,
} from "react-icons/hi2";
import NuaSvg from "../images/nua.svg";
import pkgJson from '../../package.json';

const NAV_ITEMS = [
  { to: '/',             label: 'Home',          icon: <HiHome className="w-5 h-5" /> },
  { to: '/sitesettings', label: 'Site Settings',  icon: <HiCog6Tooth className="w-5 h-5" /> },
  { to: '/alldevices',   label: 'All Devices',    icon: <HiComputerDesktop className="w-5 h-5" /> },
  { to: '/trafficrules', label: 'Traffic Rules',  icon: <HiServer className="w-5 h-5" /> },
  { to: '/seeallapps',   label: 'All Apps',       icon: <HiSquares2X2 className="w-5 h-5" /> },
];

const THEMES = [
  { name: 'light',     bg: '#ffffff', border: '#d1d5db' },
  { name: 'dark',      bg: '#1d232a', border: '#374151' },
  { name: 'cyberpunk', bg: '#ff7598', border: '#ff00ff' },
  { name: 'coffee',    bg: '#6f4e37', border: '#a07850' },
];

export default function Navbar({ themeValue, callBackChanged }) {
  const [connected, setConnected] = useState(null);
  const drawerRef = useRef();
  const location = useLocation();

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          const data = await res.json();
          setConnected(data.unifiConnected ?? true);
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    };
    checkHealth();
    const id = setInterval(checkHealth, 30000);
    return () => clearInterval(id);
  }, []);

  const setTheme = async (themeName) => {
    try {
      const res = await fetch('/updatetheme', {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: themeName }),
      });
      if (res.ok) callBackChanged();
    } catch (error) {
      if (error) throw error;
    }
  };

  const updateTheme = () => setTheme(themeValue === 'light' ? 'dark' : 'light');

  const closeDrawer = () => {
    drawerRef.current.checked = false;
  };

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <>
      <div className="navbar bg-base-100 grid grid-flow-row grid-cols-2 z-50">
        <div className="flex flex-row items-center justify-center w-fit z-50 mr-4 gap-1">
          <div className="drawer w-fit">
            <input id="my-drawer" type="checkbox" ref={drawerRef} className="drawer-toggle" />
            <div className="drawer-content flex items-center justify-center">
              <label htmlFor="my-drawer" className="text-neutral drawer-button font-bold">
                <GiHamburgerMenu className="w-8 h-8 hover:text-base-300 hover:cursor-pointer" />
              </label>
            </div>

            <div className="drawer-side z-50">
              <label htmlFor="my-drawer" aria-label="close sidebar" className="drawer-overlay" />

              <div className="flex flex-col min-h-full w-52 sm:w-80 bg-base-200 text-base-content">
                {/* Logo */}
                <div className="p-4 pb-2">
                  <Link
                    to="/"
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors"
                    onClick={closeDrawer}
                  >
                    <img src={NuaSvg} alt="NUA Logo" className="w-10 h-10" />
                    <span className="nuaFont text-2xl">NUA</span>
                  </Link>
                </div>

                {/* Connection status */}
                <div className="px-6 py-1">
                  <div className="flex items-center gap-2 text-sm">
                    {connected === null ? (
                      <span className="loading loading-ring loading-xs opacity-50" />
                    ) : connected ? (
                      <>
                        <HiSignal className="w-4 h-4 text-success" />
                        <span className="text-success font-medium">Connected</span>
                      </>
                    ) : (
                      <>
                        <HiNoSymbol className="w-4 h-4 text-error" />
                        <span className="text-error font-medium">Disconnected</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="divider my-1 mx-4" />

                {/* Nav links */}
                <ul className="menu px-2 flex-1">
                  {NAV_ITEMS.map(({ to, label, icon }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        className={`flex items-center gap-3 font-semibold text-base ${isActive(to) ? 'active' : ''}`}
                        onClick={closeDrawer}
                      >
                        {icon}
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="divider my-1 mx-4" />

                {/* Theme picker */}
                <div className="px-6 pb-2">
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">Theme</p>
                  <div className="flex gap-2 flex-wrap">
                    {THEMES.map(({ name, bg, border }) => (
                      <button
                        key={name}
                        title={name.charAt(0).toUpperCase() + name.slice(1)}
                        onClick={() => setTheme(name)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          themeValue === name ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-200 scale-110' : ''
                        }`}
                        style={{ backgroundColor: bg, borderColor: border }}
                      />
                    ))}
                  </div>
                </div>

                {/* Version */}
                <div className="px-6 pb-5 pt-2">
                  <div className="badge badge-outline text-xs">
                    Version&nbsp;<span className="text-primary">{pkgJson.version}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Brand in topbar */}
          <div className="flex justify-center items-center">
            <Link className="btn btn-ghost px-1 nuaFont text-xl" to="/">
              <img src={NuaSvg} alt="NUA Logo" className="w-10 h-10 p-0" />
              NUA
            </Link>
          </div>
        </div>

        {/* Right: connection dot + theme toggle */}
        <div className="flex items-center justify-end gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              connected === null
                ? 'bg-base-content/30 animate-pulse'
                : connected
                ? 'bg-success'
                : 'bg-error animate-pulse'
            }`}
            title={
              connected === null
                ? 'Checking UniFi connection…'
                : connected
                ? 'UniFi connected'
                : 'UniFi disconnected'
            }
          />
          <label className="swap swap-rotate">
            <input
              type="checkbox"
              className="theme-controller"
              checked={themeValue === 'dark'}
              onChange={updateTheme}
            />
            {/* Sun — visible in light mode */}
            <svg className="swap-off fill-current w-9 h-9" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
            </svg>
            {/* Moon — visible in dark mode */}
            <svg className="swap-on fill-current w-9 h-9" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/>
            </svg>
          </label>
        </div>
      </div>
    </>
  );
}
