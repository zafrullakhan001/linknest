import { useEffect, useState } from 'react';
import { heartbeatAppPresence, leaveAppPresence, type AppPresenceCounts } from '../services/appPresenceService';

const HEARTBEAT_MS = 15000;

export function useAppPresence(): AppPresenceCounts | null {
  const [counts, setCounts] = useState<AppPresenceCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      const next = await heartbeatAppPresence();
      if (!cancelled && next) {
        setCounts(next);
      }
    };

    void beat();
    const timer = window.setInterval(() => {
      void beat();
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      leaveAppPresence();
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
      leaveAppPresence();
    };
  }, []);

  return counts;
}
