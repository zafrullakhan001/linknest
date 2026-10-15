import { useEffect, useState } from 'react';

/**
 * True when the app is running as an installed PWA (home-screen / installed app).
 *
 * Why not just a CSS @media (display-mode: standalone): iOS Safari did not report
 * display-mode for home-screen web apps until recently, and still returns nothing
 * for older versions. `navigator.standalone` is the iOS-specific signal.
 */
export function useStandaloneMode(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => detectStandalone());

  useEffect(() => {
    const mql = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(display-mode: standalone)')
      : null;
    const onChange = () => setStandalone(detectStandalone());
    mql?.addEventListener?.(
      'change',
      onChange
    );
    window.addEventListener('appinstalled', onChange);
    return () => {
      mql?.removeEventListener?.('change', onChange);
      window.removeEventListener('appinstalled', onChange);
    };
  }, []);

  return standalone;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (iosStandalone === true) return true;
  // Chromium / Android
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

export default useStandaloneMode;
