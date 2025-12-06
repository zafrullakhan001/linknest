import React, { useState, useEffect } from 'react';

// USA Timezones
const USA_TIMEZONES = [
  { name: 'Eastern Time', tz: 'America/New_York', abbrev: 'ET' },
  { name: 'Central Time', tz: 'America/Chicago', abbrev: 'CT' },
  { name: 'Mountain Time', tz: 'America/Denver', abbrev: 'MT' },
  { name: 'Pacific Time', tz: 'America/Los_Angeles', abbrev: 'PT' },
  { name: 'Alaska Time', tz: 'America/Anchorage', abbrev: 'AKT' },
  { name: 'Hawaii Time', tz: 'Pacific/Honolulu', abbrev: 'HST' },
];

export const TimezoneDisplay: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timezone, setTimezone] = useState<string>('');
  const [timezoneOffset, setTimezoneOffset] = useState<string>('');
  const [isAnalog, setIsAnalog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Get timezone information
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(tz);

    // Get timezone offset
    const offset = -new Date().getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    setTimezoneOffset(`${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`);

    // Update time every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format date and time
  const formatDateTime = (date: Date, timeZone?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timeZone,
    };
    return date.toLocaleString(undefined, options);
  };

  // Get timezone offset for a specific timezone
  const getTimezoneOffset = (timeZone: string) => {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tz = new Date(now.toLocaleString('en-US', { timeZone }));
    const offset = (tz.getTime() - utc.getTime()) / (1000 * 60); // offset in minutes
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    return `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
  };

  // Calculate clock hand angles
  const hours = currentTime.getHours() % 12;
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  
  const hourAngle = (hours * 30) + (minutes * 0.5); // 30 degrees per hour, 0.5 degrees per minute
  const minuteAngle = minutes * 6; // 6 degrees per minute
  const secondAngle = seconds * 6; // 6 degrees per second

  const toggleClock = () => {
    setIsAnalog(!isAnalog);
    setIsExpanded(false); // Close timezone list when switching clock type
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clock toggle
    setIsExpanded(!isExpanded);
  };

  return (
    <div 
      className={`relative flex flex-col items-start gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg transition-all ${isAnalog ? 'py-4 px-4' : ''}`}
      style={{ zIndex: 2 }}
      title={`Click to switch to ${isAnalog ? 'digital' : 'analog'} clock - Timezone: ${timezone} (UTC${timezoneOffset})`}
    >
      {isAnalog ? (
        // Analog Clock
        <div 
          className="flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={toggleClock}
          title="Click to switch to digital clock"
        >
          <div className="relative w-36 h-36 rounded-full border-4 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-inner">
            {/* Clock center */}
            <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-slate-700 dark:bg-slate-300 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-10" />
            
            {/* Hour marks */}
            {[12, 3, 6, 9].map((num) => {
              const angle = (num * 30 - 90) * (Math.PI / 180);
              const x = 72 + 48 * Math.cos(angle);
              const y = 72 + 48 * Math.sin(angle);
              return (
                <div
                  key={num}
                  className="absolute text-base font-semibold text-slate-700 dark:text-slate-300"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  {num === 12 ? '12' : num}
                </div>
              );
            })}
            
            {/* Hour hand */}
            <div
              className="absolute top-1/2 left-1/2 bg-slate-700 dark:bg-slate-300 origin-bottom z-5"
              style={{
                width: '4px',
                height: '20%',
                transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`,
                transformOrigin: '50% 100%',
                borderRadius: '2px'
              }}
            />
            
            {/* Minute hand */}
            <div
              className="absolute top-1/2 left-1/2 bg-slate-600 dark:bg-slate-400 origin-bottom z-6"
              style={{
                width: '3px',
                height: '30%',
                transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`,
                transformOrigin: '50% 100%',
                borderRadius: '1.5px'
              }}
            />
            
            {/* Second hand */}
            <div
              className="absolute top-1/2 left-1/2 bg-red-500 origin-bottom z-7"
              style={{
                width: '2px',
                height: '35%',
                transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`,
                transformOrigin: '50% 100%',
                borderRadius: '1px'
              }}
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs opacity-75">{timezone}</span>
            <span className="text-[10px] opacity-60">UTC{timezoneOffset}</span>
          </div>
        </div>
      ) : (
        // Digital Clock
        <div className="w-full">
          <div className="flex items-center gap-2 rounded px-1 -mx-1">
            <div 
              className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-white/50 dark:hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors" 
              onClick={toggleClock}
              title="Click to switch to analog clock"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className="w-3.5 h-3.5 flex-shrink-0"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <div className="flex flex-col leading-tight flex-1">
                <span className="font-medium">{formatDateTime(currentTime)}</span>
                <span className="text-[10px] opacity-75">{timezone} (UTC{timezoneOffset})</span>
              </div>
            </div>
            <button
              onClick={toggleExpand}
              className="flex-shrink-0 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              title={isExpanded ? "Hide USA timezones" : "Show USA timezones"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          {/* Expandable USA Timezones List */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-2">
              {USA_TIMEZONES.map((tzInfo) => {
                const tzOffset = getTimezoneOffset(tzInfo.tz);
                return (
                  <div
                    key={tzInfo.tz}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 20 20" 
                      fill="currentColor" 
                      className="w-3 h-3 flex-shrink-0 opacity-60"
                    >
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                    </svg>
                    <div className="flex flex-col leading-tight flex-1">
                      <span className="font-medium text-[11px]">{formatDateTime(currentTime, tzInfo.tz)}</span>
                      <span className="text-[9px] opacity-75">{tzInfo.name} ({tzInfo.abbrev}) - UTC{tzOffset}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

