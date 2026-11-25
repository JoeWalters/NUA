import { useState, useEffect, useMemo } from 'react';
import { reasonsByMac } from './blockedReasons';

// Fetches the newest ActivityLog rows for the given MAC list and reduces them
// to a `{ macLower: reason }` map. One request: /activity-log?limit=200 with a
// repeated &deviceMac=<encoded> per MAC. Empty MAC list -> no request, {}.
// Failure -> {} (every card falls back to Unknown).
export default function useFetchBlockedReasons(macs) {
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(false);

  // Stable dependency key so an unstable `macs` array prop cannot re-fetch.
  const macKey = useMemo(
    () => [...new Set((macs || []).filter(Boolean))].sort().join(','),
    [macs]
  );

  useEffect(() => {
    if (!macKey) {
      setReasons({});
      setLoading(false);
      return;
    }
    let isActive = true;
    const controller = new AbortController();

    let url = '/activity-log?limit=200';
    for (const mac of macKey.split(',')) {
      url += `&deviceMac=${encodeURIComponent(mac)}`;
    }

    const fetchReasons = async () => {
      setLoading(true);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Fetching blocked reasons failed!');
        }
        const data = await response.json();
        if (!isActive) return;
        setReasons(reasonsByMac(data.logs || []));
        setLoading(false);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
        if (isActive) {
          setReasons({});
          setLoading(false);
        }
      }
    };

    fetchReasons();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [macKey]);

  return { reasons, loading };
}
