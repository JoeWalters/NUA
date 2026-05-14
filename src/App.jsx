
import { Outlet, useLocation } from "react-router-dom";
import Navbar from './components/Navbar.jsx'
import { useEffect, useState } from "react";
import BreadCrumbs from "./components/breadcrumbs/BreadCrumbs.jsx";
import SiteSettings from "./components/SiteSettings.jsx";


export default function App() {

    const [themeValue, setThemeValue] = useState('');
    const [changed, setChanged] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const location = useLocation();

    const callBackChanged = () => {
      setChanged(prev => !prev)
    }


  useEffect(() => { // get theme settings
    const getThemeSettings = async () => {
      try {
        const getTheme = await fetch('/getcurrenttheme');
      if (getTheme.ok) {
        const currentTheme = await getTheme.json();
        document.querySelector('html').dataset.theme = currentTheme;
        document.documentElement.classList.toggle('dark', currentTheme === 'dark');
        setThemeValue(currentTheme);
      }
      } catch (error) {
        if (error) throw error;
      }
    }
    getThemeSettings();
  }, [changed]);

  return (
    <>
      <Navbar themeValue={themeValue} callBackChanged={callBackChanged} onSettingsClick={() => setSettingsOpen(true)} />
      {location.pathname !== '/' && <BreadCrumbs />}
      <div key={location.pathname} className="page-enter flex items-center justify-center h-full w-full">
        <Outlet context={{ openSettings: () => setSettingsOpen(true) }} />
      </div>
      <SiteSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}


