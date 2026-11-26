import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { HiOutlineClipboardDocumentList, HiOutlineClock, HiXMark } from 'react-icons/hi2';
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi2';
import { useRefreshStream } from './custom_hooks/useRefreshStream';

// Activity Log modal — shows the most recent block/unblock/pause/bonus events.
// Fetched from GET /activity-log?limit=50 and refreshed on the shared SSE
// channel (useRefreshStream), which falls back to a poll while the stream is down.
//
// Props:
//   ref — exposes { open() } to trigger the modal
const ActivityLog = forwardRef(function ActivityLog({ onClose }, ref) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef();

  useImperativeHandle(ref, () => ({
    open: () => dialogRef.current?.showModal(),
  }));

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/activity-log?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch activity log:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Refresh on the page's shared SSE channel rather than a private 30s poll.
  useRefreshStream(fetchLogs);

  // Format a timestamp relative to now (e.g. "2m ago", "3h ago", "yesterday").
  const formatTimeAgo = (isoString) => {
    if (!isoString) return '';
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(isoString).toLocaleDateString();
  };

  // Map event types to icons and colors.
  const getEventStyle = (eventType) => {
    switch (eventType) {
      case 'block':
        return { icon: '🔒', color: 'text-error', label: 'Blocked' };
      case 'unblock':
        return { icon: '🔓', color: 'text-success', label: 'Unblocked' };
      case 'pause':
        return { icon: '⏸️', color: 'text-warning', label: 'Paused' };
      case 'unpause':
        return { icon: '▶️', color: 'text-info', label: 'Unpaused' };
      case 'bonus_start':
        return { icon: '⏱️', color: 'text-info', label: 'Bonus Started' };
      case 'bonus_end':
        return { icon: '⏹️', color: 'text-warning', label: 'Bonus Ended' };
      default:
        return { icon: 'ℹ️', color: 'text-base-content/60', label: eventType };
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
    >
      <div className="modal-box w-11/12 max-w-3xl h-[80vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <HiOutlineClipboardDocumentList className="w-5 h-5" />
            Activity Log
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="btn btn-ghost btn-sm btn-circle"
              disabled={loading}
              title="Refresh"
            >
              {loading ? (
                <span className="loading loading-spinner w-4 h-4"></span>
              ) : (
                <HiOutlineClipboardDocumentList className="w-4 h-4" />
              )}
            </button>
            <form method="dialog">
              <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
                <HiXMark className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-base-content/40 gap-2">
              <HiOutlineClipboardDocumentList className="w-12 h-12" />
              <p className="text-sm">No activity logged yet.</p>
              <p className="text-xs">Block, unblock, pause, and bonus time events will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => {
                const style = getEventStyle(log.eventType);
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                  >
                    {/* Event icon */}
                    <span className="text-xl flex-shrink-0">{style.icon}</span>

                    {/* Event details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${style.color}`}>
                          {style.label}
                        </span>
                        {log.deviceName && (
                          <span className="text-sm text-base-content">
                            {log.deviceName}
                          </span>
                        )}
                        {log.blockMode && (
                          <span className="badge badge-xs badge-ghost">
                            {log.blockMode === 'internet' ? 'Internet' : log.blockMode === 'speedlimit' ? 'Speed Limit' : 'Full'}
                          </span>
                        )}
                        {!log.success && (
                          <span className="badge badge-xs badge-error">Failed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-base-content/50 mt-0.5">
                        <span>{log.detail || style.label}</span>
                        {log.deviceMac && (
                          <span className="font-mono">{log.deviceMac}</span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-xs text-base-content/50 whitespace-nowrap">
                      {formatTimeAgo(log.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-base-300 text-xs text-base-content/40 flex-shrink-0 flex justify-between">
          <span>{logs.length} events</span>
          <span>Refreshes with the page&apos;s live channel</span>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
});

export default ActivityLog;
