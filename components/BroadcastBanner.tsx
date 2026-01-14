import React, { useState, useEffect, useRef } from 'react';
import { broadcastService, BroadcastMessage } from '../services/broadcastService';

export const BroadcastBanner: React.FC = () => {
  const [broadcast, setBroadcast] = useState<BroadcastMessage | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadBroadcast();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      loadBroadcast();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (broadcast) {
      // Check if user has dismissed this specific message
      const dismissedId = localStorage.getItem('linknest_broadcast_dismissed');
      if (dismissedId === broadcast.id.toString()) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
      
      // Check if expired
      if (broadcast.expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= broadcast.expiresAt) {
          setBroadcast(null);
        }
      }
    }
  }, [broadcast]);

  const loadBroadcast = async () => {
    try {
      const data = await broadcastService.getBroadcast();
      if (data && data.id) {
        // Check if expired
        if (data.expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          if (now >= data.expiresAt) {
            setBroadcast(null);
            setLoading(false);
            return;
          }
        }
        
        setBroadcast(data);
      } else {
        setBroadcast(null);
      }
    } catch (error) {
      console.error('Failed to load broadcast message:', error);
      setBroadcast(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (broadcast) {
      localStorage.setItem('linknest_broadcast_dismissed', broadcast.id.toString());
      setDismissed(true);
    }
  };

  if (loading || !broadcast || dismissed) {
    return null;
  }

  // Check if expired
  if (broadcast.expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= broadcast.expiresAt) {
      return null;
    }
  }

  return (
    <>
      <div
        className="relative w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{ height: '40px' }}
      >
        <div className="absolute inset-0 flex items-center overflow-hidden">
          <div
            className="broadcast-marquee"
            style={{
              fontFamily: broadcast.fontFamily || 'Arial, sans-serif',
              fontSize: broadcast.fontSize || '16px',
              color: broadcast.color || '#ff0000',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              animation: 'scroll-text 30s linear infinite',
            }}
          >
            {broadcast.message}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Dismiss message"
          aria-label="Dismiss message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
      <style>{`
        @keyframes scroll-text {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .broadcast-marquee {
          display: inline-block;
          padding-right: 100%;
        }
      `}</style>
    </>
  );
};
