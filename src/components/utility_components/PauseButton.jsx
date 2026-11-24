import { useEffect, useRef, useState } from 'react';
import { HiOutlinePause, HiOutlinePlay } from 'react-icons/hi2';

// Pause Internet Timer button. Shows a quick preset menu when the device is
// online, and a countdown + unpause button when the device is paused.
//
// Props:
//   deviceId       — the device's DB id
//   paused         — whether the device is currently paused (from pausedUntil)
//   pausedUntil    — ISO timestamp of when the pause will expire (or null)
//   handleRenderToggle — called after a pause/unpause to trigger a re-render
export default function PauseButton({ deviceId, paused, pausedUntil, handleRenderToggle, showToast }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [milliTime, setMilliTime] = useState(null);
  const menuRef = useRef(null);

  // Poll the server for the timer when a pause is active.
  useEffect(() => {
    let isMounted = true;
    if (paused && deviceId) {
      const poll = async () => {
        try {
          const res = await fetch('/getpausetimer', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
          });
          if (res.status === 200) {
            const data = await res.json();
            if (isMounted) setMilliTime(data.timer);
          } else if (res.status === 204) {
            if (isMounted) setMilliTime(null);
          }
        } catch (error) {
          console.error('Pause timer poll error:', error);
        }
      };
      poll();
      const interval = setInterval(poll, 5000);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
    return () => {
      isMounted = false;
      setMilliTime(null);
    };
  }, [deviceId, paused]);

  // Close menu on outside click.
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Countdown display.
  useEffect(() => {
    if (!milliTime || milliTime <= 0) return;
    const interval = setInterval(() => {
      setMilliTime((prev) => {
        if (prev <= 1000) {
          setMilliTime(null);
          handleRenderToggle?.();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milliTime]);

  const formatRemaining = (ms) => {
    if (!ms || ms <= 0) return 'Expired';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const handlePause = async (preset) => {
    setMenuOpen(false);
    setLoading(true);
    try {
      const res = await fetch('/pause-device', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, preset }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMilliTime(data.timer);
        showToast?.('Internet paused');
        handleRenderToggle?.();
      } else {
        console.error('Pause failed:', data.error || data.message);
        showToast?.(data.error || data.message || 'Failed to pause internet');
      }
    } catch (error) {
      console.error('Pause error:', error);
      showToast?.('Network error while pausing internet');
    } finally {
      setLoading(false);
    }
  };

  const handleUnpause = async () => {
    setLoading(true);
    try {
      const res = await fetch('/unpause-device', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMilliTime(null);
        showToast?.('Internet resumed');
        handleRenderToggle?.();
      } else {
        console.error('Unpause failed:', data.error || data.message);
        showToast?.(data.error || data.message || 'Failed to resume internet');
      }
    } catch (error) {
      console.error('Unpause error:', error);
      showToast?.('Network error while resuming internet');
    } finally {
      setLoading(false);
    }
  };

  const presets = [
    { label: '30 minutes', value: '30min' },
    { label: '1 hour', value: '1hr' },
    { label: '3 hours', value: '3hrs' },
    { label: 'Rest of today', value: 'restOfToday' },
  ];

  // When paused: show countdown + unpause.
  if (paused || milliTime) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-xs btn-warning gap-1"
          onClick={handleUnpause}
          disabled={loading}
          title="Unpause this device"
        >
          {loading ? (
            <span className="loading loading-spinner w-3 h-3"></span>
          ) : (
            <HiOutlinePlay className="w-3.5 h-3.5" />
          )}
          <span className="text-xs">{milliTime ? formatRemaining(milliTime) : 'Paused'}</span>
        </button>
      </div>
    );
  }

  // When online: show pause button + dropdown menu.
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="btn btn-xs btn-outline btn-error gap-1"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={loading}
        title="Pause internet for this device"
      >
        <HiOutlinePause className="w-3.5 h-3.5" />
        <span className="text-xs">Pause</span>
      </button>

      {menuOpen && (
        <div className="absolute z-50 mt-1 w-40 bg-base-100 rounded-lg shadow-lg border border-base-300 py-1">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-base-100 dark:hover:bg-base-300 text-base-content"
              onClick={() => handlePause(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
