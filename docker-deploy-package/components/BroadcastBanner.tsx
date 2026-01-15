import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { broadcastService, BroadcastMessage } from '../services/broadcastService';

export const BroadcastBanner: React.FC = () => {
  const [broadcast, setBroadcast] = useState<BroadcastMessage | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [screenWidth, setScreenWidth] = useState<number>(0);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBroadcast();

    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      loadBroadcast();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Track screen width for intelligent message repetition
    const updateWidth = () => setScreenWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Add/remove body class when banner is visible
  useEffect(() => {
    const shouldShow = !loading && broadcast && !dismissed;
    if (shouldShow) {
      document.body.classList.add('has-broadcast-banner');
    } else {
      document.body.classList.remove('has-broadcast-banner');
    }

    return () => {
      document.body.classList.remove('has-broadcast-banner');
    };
  }, [loading, broadcast, dismissed]);

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

  const handleMessageClick = () => {
    setShowModal(true);
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

  const scrollSpeed = broadcast.scrollSpeed || 30;

  const content = (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-40 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer"
        style={{ height: '40px' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onClick={handleMessageClick}
      >
        <div className="absolute inset-0 flex items-center overflow-hidden">
          <div
            ref={messageRef}
            className="broadcast-marquee"
            data-text={broadcast.message}
            style={{
              fontFamily: broadcast.fontFamily || 'Arial, sans-serif',
              fontSize: broadcast.fontSize || '16px',
              color: broadcast.color || '#ff0000',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              animation: `scroll-text ${scrollSpeed}s linear infinite`,
              animationPlayState: isPaused ? 'paused' : 'running',
              pointerEvents: 'none',
            }}
            title="Click to read full message"
          >
            {broadcast.message}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Dismiss message"
          aria-label="Dismiss message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>


      {/* Modal for full message */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Broadcast Message
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                aria-label="Close modal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div
              className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words"
              style={{
                fontFamily: broadcast.fontFamily || 'Arial, sans-serif',
                fontSize: broadcast.fontSize || '16px',
                color: broadcast.color || '#ff0000',
              }}
            >
              {broadcast.message}
            </div>
            {broadcast.expiresAt && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Expires: {new Date(broadcast.expiresAt * 1000).toLocaleString()}
                </p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Dismiss Forever
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
        }
        .broadcast-marquee::after {
          content: attr(data-text);
          padding-left: 100vw;
        }
      `}</style>
    </>
  );

  return ReactDOM.createPortal(content, document.body);
};
