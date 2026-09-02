import { useEffect, useRef, useState } from 'react';
import {
  heartbeatTilePresence,
  leaveTilePresence,
  type TilePresenceMode,
  type TilePresenceViewer,
} from '../services/tilePresenceService';

const HEARTBEAT_MS = 15000;

export function useTilePresence(
  tileId: string | undefined,
  options: {
    enabled?: boolean;
    mode?: TilePresenceMode;
  } = {}
): TilePresenceViewer[] {
  const enabled = !!tileId && options.enabled !== false;
  const mode: TilePresenceMode = options.mode === 'editing' ? 'editing' : 'viewing';
  const [viewers, setViewers] = useState<TilePresenceViewer[]>([]);
  const tileIdRef = useRef(tileId);
  const modeRef = useRef(mode);
  tileIdRef.current = tileId;
  modeRef.current = mode;

  const skipModeBeat = useRef(true);

  useEffect(() => {
    if (!enabled || !tileId) {
      setViewers([]);
      return;
    }

    let cancelled = false;

    const beat = async () => {
      const next = await heartbeatTilePresence(tileId, modeRef.current);
      if (!cancelled && tileIdRef.current === tileId) {
        setViewers(next);
      }
    };

    void beat();
    const timer = window.setInterval(() => {
      void beat();
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      leaveTilePresence(tileId);
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
      leaveTilePresence(tileId);
    };
  }, [enabled, tileId]);

  useEffect(() => {
    if (skipModeBeat.current) {
      skipModeBeat.current = false;
      return;
    }
    if (!enabled || !tileId) return;
    void heartbeatTilePresence(tileId, mode).then((next) => {
      if (tileIdRef.current === tileId) {
        setViewers(next);
      }
    });
  }, [mode]); // tile/session handled by the interval effect

  return viewers;
}
