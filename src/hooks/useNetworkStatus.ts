import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  lastChangedAt: Date | null;
}

/**
 * Reusable React hook that monitors browser network connectivity in real-time.
 * Listens to native browser 'online' and 'offline' events.
 * 
 * Note: navigator.onLine indicates whether the browser has a network connection,
 * not whether remote backend endpoints or PHC servers are reachable.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setLastChangedAt(new Date());
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastChangedAt(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastChangedAt };
}
